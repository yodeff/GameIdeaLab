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
  version: 1,
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
    ['版が違う', (w: any) => ({ ...w, version: 2 })],
    ['モードが違う', (w: any) => ({ ...w, mode: 'x' })],
    ['語が長すぎる', (w: any) => ({ ...w, draw: { ...w.draw, slots: { ...w.draw.slots, genre: { ...w.draw.slots.genre, value: 'あ'.repeat(51) } } } })],
    ['スロットが足りない', (w: any) => ({ ...w, draw: { ...w.draw, configs: { keyword1: { categoryIds: [] } } } })],
    ['下書きが長すぎる', (w: any) => ({ ...w, draft: { ...w.draft, body: 'あ'.repeat(20_001) } })]
  ])('%s なら null', (_name, broken) => {
    expect(parseWorkspace(broken(workspace()))).toBeNull()
  })
})

describe('parseSettingsPatch', () => {
  it('正しい部分的な設定を返す', () => {
    expect(parseSettingsPatch({ aiCount: 10, theme: 'light', aiModel: null })).toEqual({ aiCount: 10, theme: 'light', aiModel: null })
  })

  it.each([{ aiCount: 0 }, { aiCount: 11 }, { theme: 'blue' }, { unknownKey: 1 }, { windowBounds: { x: 0 } }, null])(
    '不正な値 %j は null',
    (patch) => {
      expect(parseSettingsPatch(patch)).toBeNull()
    }
  )
})

describe('parseHumanIdeaInput', () => {
  const combination = { keyword1: '鍵', keyword2: '扉', genre: 'パズル' }

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
    expect(parseHumanIdeaInput({ title: '', body: '本文', combination: { keyword1: '鍵', keyword2: '', genre: 'パズル' } })).toBeNull()
  })
})
