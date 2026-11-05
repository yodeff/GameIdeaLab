import { describe, expect, it } from 'vitest'
import type { KeywordDictionary } from '@core/dictionary'
import {
  HISTORY_LIMIT,
  candidateCategories,
  drawWord,
  combinationOf,
  drawAll,
  drawSlot,
  initialDrawState,
  setCategories,
  setLocked,
  setManualValue,
  type Dictionaries
} from '@core/draw'
import { formatCombination } from '@core/export'
import { seededRng, sequenceRng } from '../support/rng'

const keyword: KeywordDictionary = {
  schemaVersion: 1,
  kind: 'keyword',
  categories: [
    { id: 'small', label: '少', words: ['鍵'] },
    { id: 'large', label: '多', words: ['一', '二', '三', '四', '五', '六', '七', '八', '九'] },
    { id: 'empty', label: '空', words: [] }
  ]
}
const genre: KeywordDictionary = {
  schemaVersion: 1,
  kind: 'genre',
  categories: [{ id: 'g', label: 'G', words: ['パズル', 'RPG'] }]
}
const dictionaries: Dictionaries = { keyword, genre }

describe('抽選', () => {
  it('すべてのスロットに語が入り、キーワード 1 と 2 が違う', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = initialDrawState(dictionaries, seededRng(seed))
      const c = combinationOf(state.slots)
      expect(c.keyword1).not.toBe('')
      expect(c.keyword2).not.toBe(c.keyword1)
      expect(['パズル', 'RPG']).toContain(c.genre)
    }
  })

  it('カテゴリを均等に選び、その中から均等に選ぶ（語数の違うカテゴリでも出方がほぼ半々）', () => {
    const rng = seededRng(42)
    const categories = candidateCategories(keyword, { categoryIds: [] })
    const counts = new Map<string, number>()
    const n = 10_000
    for (let i = 0; i < n; i++) {
      const picked = drawWord(categories, [new Set()], rng)
      counts.set(picked?.value ?? '', (counts.get(picked?.value ?? '') ?? 0) + 1)
    }
    expect((counts.get('鍵') ?? 0) / n).toBeCloseTo(0.5, 1)
    expect((counts.get('一') ?? 0) / n).toBeCloseTo(0.5 / 9, 1)
  })

  it('単語の無いカテゴリだけを選んでいたら、すべてのカテゴリから引く（D-1・D-2）', () => {
    let state = initialDrawState(dictionaries, seededRng(1))
    state = setCategories(state, 'keyword1', ['empty'])
    state = drawSlot(state, 'keyword1', dictionaries, seededRng(2))
    expect(['small', 'large']).toContain(state.slots.keyword1.categoryId)
  })

  it('選んだカテゴリからだけ引く', () => {
    let state = initialDrawState(dictionaries, seededRng(1))
    state = setCategories(state, 'keyword2', ['large'])
    for (let i = 0; i < 50; i++) {
      state = drawSlot(state, 'keyword2', dictionaries, seededRng(i))
      expect(state.slots.keyword2.categoryId).toBe('large')
    }
  })

  it('同じスロットで直近の語をなるべく避ける（D-3）', () => {
    const many: KeywordDictionary = {
      schemaVersion: 1,
      kind: 'keyword',
      categories: [{ id: 'a', label: 'A', words: Array.from({ length: 30 }, (_, i) => `語${'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ'[i]}`) }]
    }
    const d = { keyword: many, genre }
    const rng = seededRng(7)
    let state = initialDrawState(d, rng)
    const seen: string[] = []
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      state = drawSlot(state, 'keyword1', d, rng)
      seen.push(state.slots.keyword1.value)
    }
    expect(new Set(seen).size).toBe(HISTORY_LIMIT)
    expect(state.history.keyword1).toHaveLength(HISTORY_LIMIT)
  })

  it('避ける語しか残っていなければ直近の除外を緩め、もう一方のキーワードとは重ならない', () => {
    const tiny: KeywordDictionary = {
      schemaVersion: 1,
      kind: 'keyword',
      categories: [{ id: 'a', label: 'A', words: ['鍵', '扉'] }]
    }
    const d = { keyword: tiny, genre }
    let state = initialDrawState(d, sequenceRng([0]))
    for (let i = 0; i < 5; i++) {
      state = drawAll(state, d, seededRng(i))
      expect(state.slots.keyword1.value).not.toBe(state.slots.keyword2.value)
    }
  })

  it('一括抽選は固定したスロットを変えない', () => {
    let state = initialDrawState(dictionaries, seededRng(3))
    state = setLocked(state, 'genre', true)
    const lockedGenre = state.slots.genre.value
    for (let i = 0; i < 20; i++) {
      state = drawAll(state, dictionaries, seededRng(100 + i))
      expect(state.slots.genre.value).toBe(lockedGenre)
    }
  })

  it('固定していても個別に引き直せる', () => {
    let state = setLocked(initialDrawState(dictionaries, seededRng(3)), 'genre', true)
    const before = state.slots.genre.value
    state = drawSlot(state, 'genre', dictionaries, seededRng(9))
    expect(state.slots.genre.value).not.toBe(before)
    expect(state.slots.genre.locked).toBe(true)
  })

  it('手動入力は空白を除いて自動で固定し、空や長すぎる語は受け付けない（D-4）', () => {
    const state = initialDrawState(dictionaries, seededRng(3))
    const manual = setManualValue(state, 'keyword1', '  宇宙エレベーター ')
    expect(manual.slots.keyword1).toEqual({ value: '宇宙エレベーター', source: 'manual', categoryId: null, locked: true })
    expect(setManualValue(state, 'keyword1', '   ')).toBe(state)
    expect(setManualValue(state, 'keyword1', 'あ'.repeat(51))).toBe(state)
  })

  it('入力の状態を書き換えない', () => {
    const state = initialDrawState(dictionaries, seededRng(3))
    const snapshot = structuredClone(state)
    drawAll(state, dictionaries, seededRng(4))
    setManualValue(state, 'keyword2', '鏡')
    setCategories(state, 'keyword1', ['large'])
    expect(state).toEqual(snapshot)
  })
})

describe('formatCombination', () => {
  it('「 × 」でつなぐ（D-8）', () => {
    expect(formatCombination({ keyword1: '自動販売機', keyword2: '寄生', genre: '経営シミュレーション' })).toBe(
      '自動販売機 × 寄生 × 経営シミュレーション'
    )
  })
})
