import { describe, expect, it } from 'vitest'
import { initialDrawState } from '@core/draw'
import { parseHumanIdeaInput } from '@core/idea'
import { parseSettingsPatch } from '@core/settings'
import { emptyDraft, parseWorkspace, type Workspace } from '@core/workspace'
import type { KeywordDictionary } from '@core/dictionary'
import { sequenceRng } from '../support/rng'

const dictionaries: { keyword: KeywordDictionary; genre: KeywordDictionary } = {
  keyword: { schemaVersion: 1, kind: 'keyword', categories: [{ id: 'a', label: 'A', words: ['鍵', '扉', '鏡'] }] },
  genre: { schemaVersion: 1, kind: 'genre', categories: [{ id: 'g', label: 'G', words: ['パズル'] }] }
}
const workspace = (): Workspace => ({
  version: 2,
  mode: 'human',
  draw: initialDrawState(dictionaries, sequenceRng([0.2, 0.7])),
  draft: emptyDraft('2026-11-05T00:00:00.000Z')
})

describe('parseWorkspace', () => {
  it('正しい作業状態をそのまま返す', () => {
    const ws = workspace()
    expect(parseWorkspace(JSON.parse(JSON.stringify(ws)))).toEqual(ws)
  })

  it.each([
    ['版が違う', (w: any) => ({ ...w, version: 3 })],
    ['モードが違う', (w: any) => ({ ...w, mode: 'x' })],
    ['語が長すぎる', (w: any) => ({ ...w, draw: { slots: w.draw.slots.map((s: any, i: number) => (i === 0 ? { ...s, value: 'あ'.repeat(51) } : s)) } })],
    ['キーワードが 0', (w: any) => ({ ...w, draw: { slots: w.draw.slots.filter((s: any) => s.kind !== 'keyword') } })],
    ['キーワードが 6', (w: any) => ({ ...w, draw: { slots: [...w.draw.slots, ...[3, 4, 5, 6].map((n) => ({ ...w.draw.slots[1], id: `k${n}` }))] } })],
    ['ID が重なる', (w: any) => ({ ...w, draw: { slots: [...w.draw.slots, w.draw.slots[2]] } })],
    ['ジャンルが右にある', (w: any) => ({ ...w, draw: { slots: [...w.draw.slots.slice(1), w.draw.slots[0]] } })],
    ['種類が違う', (w: any) => ({ ...w, draw: { slots: w.draw.slots.map((s: any) => ({ ...s, kind: 'x' })) } })],
    ['下書きが長すぎる', (w: any) => ({ ...w, draft: { ...w.draft, body: 'あ'.repeat(20_001) } })]
  ])('%s なら null', (_name, broken) => {
    expect(parseWorkspace(broken(workspace()))).toBeNull()
  })
})

describe('作業状態の版 1 → 版 2', () => {
  const slot = (value: string, locked = false) => ({ value, source: 'draw', categoryId: 'a', locked })
  const v1 = {
    version: 1,
    mode: 'ai',
    draw: {
      slots: { keyword1: slot('鍵'), keyword2: slot('扉', true), genre: slot('パズル') },
      configs: { keyword1: { categoryIds: ['a'] }, keyword2: { categoryIds: [] }, genre: { categoryIds: [] } },
      history: { keyword1: ['鍵'], keyword2: [], genre: ['パズル'] }
    },
    draft: { title: '', body: '下書き', startedWith: { keyword1: '鍵', keyword2: '扉', genre: 'パズル' }, updatedAt: '2026-11-01T00:00:00.000Z' }
  }

  it('ジャンルを左にした並びに直し、固定・カテゴリ・履歴・書き始めの組み合わせを引き継ぐ', () => {
    const ws = parseWorkspace(v1)
    expect(ws?.version).toBe(2)
    expect(ws?.draw.slots.map((s) => [s.id, s.kind, s.value, s.locked])).toEqual([
      ['g1', 'genre', 'パズル', false],
      ['k1', 'keyword', '鍵', false],
      ['k2', 'keyword', '扉', true]
    ])
    expect(ws?.draw.slots[1]?.categoryIds).toEqual(['a'])
    expect(ws?.draw.slots[0]?.history).toEqual(['パズル'])
    expect(ws?.draft.startedWith).toEqual({ genres: ['パズル'], keywords: ['鍵', '扉'] })
  })

  it('版 1 の形が崩れていれば null', () => {
    expect(parseWorkspace({ ...v1, draw: { ...v1.draw, configs: {} } })).toBeNull()
  })
})

describe('parseSettingsPatch', () => {
  it('正しい部分的な設定を返す', () => {
    expect(parseSettingsPatch({ aiCount: 10, theme: 'light', aiModel: null, sound: false, soundVolume: 0 })).toEqual({ aiCount: 10, theme: 'light', aiModel: null, sound: false, soundVolume: 0 })
  })

  it.each([{ aiCount: 0 }, { aiCount: 11 }, { theme: 'blue' }, { sound: 1 }, { soundVolume: 101 }, { soundVolume: 2.5 }, { unknownKey: 1 }, { windowBounds: { x: 0 } }, null])(
    '不正な値 %j は null',
    (patch) => {
      expect(parseSettingsPatch(patch)).toBeNull()
    }
  )
})

describe('parseHumanIdeaInput', () => {
  const combination = { genres: ['パズル'], keywords: ['鍵', '扉'] }

  it('タイトルが空なら本文の 1 行目から作る（D-11）', () => {
    expect(parseHumanIdeaInput({ title: ' ', body: '  鍵を育てるパズル\n二行目', combination })).toEqual({
      title: '鍵を育てるパズル',
      body: '鍵を育てるパズル\n二行目',
      combination
    })
  })

  it('本文が空なら null', () => {
    expect(parseHumanIdeaInput({ title: '題', body: '  \n ', combination })).toBeNull()
  })

  it('組み合わせが欠けていれば null', () => {
    expect(parseHumanIdeaInput({ title: '', body: '本文', combination: { genres: ['パズル'], keywords: ['鍵', ''] } })).toBeNull()
  })
})
