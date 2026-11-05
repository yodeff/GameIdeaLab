import { describe, expect, it } from 'vitest'
import type { KeywordDictionary } from '@core/dictionary'
import {
  HISTORY_LIMIT,
  SLOT_LIMITS,
  addSlot,
  candidateCategories,
  combinationOf,
  drawAll,
  drawSlot,
  drawWord,
  initialDrawState,
  removeSlot,
  sameCombination,
  setCategories,
  setLocked,
  setManualValue,
  slotsOf,
  type Dictionaries,
  type DrawState
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

const slotOf = (state: DrawState, id: string) => state.slots.find((s) => s.id === id)
const valueOf = (state: DrawState, id: string) => slotOf(state, id)?.value

describe('抽選', () => {
  it('最初はジャンル 1・キーワード 2 で、ジャンルが左。同じ種類の語は重ならない', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = initialDrawState(dictionaries, seededRng(seed))
      expect(state.slots.map((s) => s.id)).toEqual(['g1', 'k1', 'k2'])
      const c = combinationOf(state)
      expect(c.keywords).toHaveLength(2)
      expect(c.keywords[0]).not.toBe(c.keywords[1])
      expect(c.genres).toHaveLength(1)
      expect(['パズル', 'RPG']).toContain(c.genres[0])
    }
  })

  it('カテゴリを均等に選び、その中から均等に選ぶ（語数の違うカテゴリでも出方がほぼ半々）', () => {
    const rng = seededRng(42)
    const categories = candidateCategories(keyword, [])
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
    state = setCategories(state, 'k1', ['empty'])
    state = drawSlot(state, 'k1', dictionaries, seededRng(2))
    expect(['small', 'large']).toContain(slotOf(state, 'k1')?.categoryId)
  })

  it('選んだカテゴリからだけ引く', () => {
    let state = initialDrawState(dictionaries, seededRng(1))
    state = setCategories(state, 'k2', ['large'])
    for (let i = 0; i < 50; i++) {
      state = drawSlot(state, 'k2', dictionaries, seededRng(i))
      expect(slotOf(state, 'k2')?.categoryId).toBe('large')
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
      state = drawSlot(state, 'k1', d, rng)
      seen.push(valueOf(state, 'k1') ?? '')
    }
    expect(new Set(seen).size).toBe(HISTORY_LIMIT)
    expect(slotOf(state, 'k1')?.history).toHaveLength(HISTORY_LIMIT)
  })

  it('避ける語しか残っていなければ直近の除外を緩め、ほかのキーワードとは重ならない', () => {
    const tiny: KeywordDictionary = {
      schemaVersion: 1,
      kind: 'keyword',
      categories: [{ id: 'a', label: 'A', words: ['鍵', '扉'] }]
    }
    const d = { keyword: tiny, genre }
    let state = initialDrawState(d, sequenceRng([0]))
    for (let i = 0; i < 5; i++) {
      state = drawAll(state, d, seededRng(i))
      expect(valueOf(state, 'k1')).not.toBe(valueOf(state, 'k2'))
    }
  })

  it('一括抽選は固定したスロットを変えない', () => {
    let state = initialDrawState(dictionaries, seededRng(3))
    state = setLocked(state, 'g1', true)
    const lockedGenre = valueOf(state, 'g1')
    for (let i = 0; i < 20; i++) {
      state = drawAll(state, dictionaries, seededRng(100 + i))
      expect(valueOf(state, 'g1')).toBe(lockedGenre)
    }
  })

  it('固定していても個別に引き直せる', () => {
    let state = setLocked(initialDrawState(dictionaries, seededRng(3)), 'g1', true)
    const before = valueOf(state, 'g1')
    state = drawSlot(state, 'g1', dictionaries, seededRng(9))
    expect(valueOf(state, 'g1')).not.toBe(before)
    expect(slotOf(state, 'g1')?.locked).toBe(true)
  })

  it('手動入力は空白を除いて自動で固定し、空や長すぎる語は受け付けない（D-4）', () => {
    const state = initialDrawState(dictionaries, seededRng(3))
    const manual = setManualValue(state, 'k1', '  宇宙エレベーター ')
    expect(slotOf(manual, 'k1')).toMatchObject({ value: '宇宙エレベーター', source: 'manual', categoryId: null, locked: true })
    expect(setManualValue(state, 'k1', '   ')).toBe(state)
    expect(setManualValue(state, 'k1', 'あ'.repeat(51))).toBe(state)
  })

  it('入力の状態を書き換えない', () => {
    const state = initialDrawState(dictionaries, seededRng(3))
    const snapshot = structuredClone(state)
    drawAll(state, dictionaries, seededRng(4))
    setManualValue(state, 'k2', '鏡')
    setCategories(state, 'k1', ['large'])
    addSlot(state, 'keyword', dictionaries, seededRng(5))
    removeSlot(state, 'g1')
    expect(state).toEqual(snapshot)
  })

  it('知らない ID は何もしない', () => {
    const state = initialDrawState(dictionaries, seededRng(3))
    expect(drawSlot(state, 'k9', dictionaries, seededRng(1))).toBe(state)
    expect(removeSlot(state, 'k9')).toBe(state)
  })
})

describe('スロットの数を変える', () => {
  const wide: KeywordDictionary = {
    schemaVersion: 1,
    kind: 'genre',
    categories: [{ id: 'g', label: 'G', words: ['パズル', 'RPG', 'ローグライク', '音ゲー', 'FPS'] }]
  }
  const d = { keyword, genre: wide }

  it('足したスロットはすぐに引かれ、同じ種類の並びの右端に入る（ジャンルは常に左）', () => {
    let state = initialDrawState(d, seededRng(1))
    state = addSlot(state, 'genre', d, seededRng(2))
    expect(state.slots.map((s) => s.id)).toEqual(['g1', 'g2', 'k1', 'k2'])
    expect(valueOf(state, 'g2')).not.toBe('')
    expect(valueOf(state, 'g2')).not.toBe(valueOf(state, 'g1'))
    state = addSlot(state, 'keyword', d, seededRng(3))
    expect(state.slots.map((s) => s.id)).toEqual(['g1', 'g2', 'k1', 'k2', 'k3'])
  })

  it('上限を超えて足せず、下限を下回って外せない', () => {
    let state = initialDrawState(d, seededRng(1))
    for (let i = 0; i < 10; i++) state = addSlot(state, 'genre', d, seededRng(i))
    for (let i = 0; i < 10; i++) state = addSlot(state, 'keyword', d, seededRng(i))
    expect(slotsOf(state, 'genre')).toHaveLength(SLOT_LIMITS.genre.max)
    expect(slotsOf(state, 'keyword')).toHaveLength(SLOT_LIMITS.keyword.max)
    for (const s of [...state.slots]) state = removeSlot(state, s.id)
    expect(slotsOf(state, 'genre')).toHaveLength(SLOT_LIMITS.genre.min)
    expect(slotsOf(state, 'keyword')).toHaveLength(SLOT_LIMITS.keyword.min)
  })

  it('ジャンルは 0 にでき、その組み合わせはジャンル自由になる', () => {
    const state = removeSlot(initialDrawState(d, seededRng(1)), 'g1')
    const c = combinationOf(state)
    expect(c.genres).toEqual([])
    expect(formatCombination(c)).toMatch(/（ジャンル自由）$/)
    expect(drawAll(state, d, seededRng(2)).slots).toHaveLength(2)
  })

  it('新しい ID は種類ごとに、いまある最大の番号 + 1', () => {
    let state = initialDrawState(d, seededRng(1))
    state = addSlot(state, 'keyword', d, seededRng(2))
    state = removeSlot(state, 'k3')
    state = addSlot(state, 'keyword', d, seededRng(3))
    expect(slotsOf(state, 'keyword').map((s) => s.id)).toEqual(['k1', 'k2', 'k3'])
  })
})

describe('組み合わせ', () => {
  it('ジャンルを先に「 × 」でつなぐ（D-8）', () => {
    expect(formatCombination({ genres: ['経営シミュレーション'], keywords: ['自動販売機', '寄生'] })).toBe(
      '経営シミュレーション × 自動販売機 × 寄生'
    )
    expect(formatCombination({ genres: ['パズル', 'RPG'], keywords: ['鍵'] })).toBe('パズル × RPG × 鍵')
  })

  it('同じかどうかは種類ごとの並びで比べる', () => {
    expect(sameCombination({ genres: ['A'], keywords: ['B', 'C'] }, { genres: ['A'], keywords: ['B', 'C'] })).toBe(true)
    expect(sameCombination({ genres: ['A'], keywords: ['B', 'C'] }, { genres: ['A'], keywords: ['C', 'B'] })).toBe(false)
    expect(sameCombination({ genres: [], keywords: ['A', 'B'] }, { genres: ['A'], keywords: ['B'] })).toBe(false)
  })
})
