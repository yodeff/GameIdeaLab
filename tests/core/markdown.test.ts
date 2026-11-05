import { describe, expect, it } from 'vitest'
import { ideaToMarkdown, ideasToMarkdown } from '@core/export'
import type { IdeaRecord } from '@core/idea'
import { sampleIdea } from '../support/ideas'

const base: IdeaRecord = {
  id: 'i',
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-05T00:00:00.000Z',
  source: 'ai',
  saved: true,
  favorite: false,
  title: '寄生自販機チェーン',
  concept: '',
  combination: { keyword1: '自動販売機', keyword2: '寄生', genre: '経営シミュレーション' },
  bodyText: '',
  body: sampleIdea(),
  direction: '王道',
  memo: '',
  parentId: null,
  derivation: null,
  generationId: 'g',
  model: 'gpt-6.1-sol',
  fidelity: 'standard',
  drawContext: null
}

describe('ideaToMarkdown（design/04 §5.2）', () => {
  it('AI の案を決まった見出しで出し、メモが空なら節を出さない', () => {
    const md = ideaToMarkdown(base)
    expect(md.startsWith('# 寄生自販機チェーン\n\n- キーワード: 自動販売機 / 寄生\n- ジャンル: 経営シミュレーション\n')).toBe(true)
    for (const h of ['## キャッチコピー', '## ひとことで', '## プレイの一場面', '## 画面', '## 操作', '## 目的', '## 遊びの流れ', '## 悩みどころ', '## 気持ちいい瞬間', '## キーワードの使い方', '## ねらい']) {
      expect(md).toContain(h)
    }
    expect(md).not.toContain('## メモ')
    expect(md).not.toContain('## 特徴的なシステム')
    // 外部に渡すときに要らない情報は出さない
    expect(md).not.toMatch(/王道|gpt-6|2026/)
  })

  it('任意の項目とメモがあれば出す', () => {
    const md = ideaToMarkdown({ ...base, memo: '協力プレイも面白そう', body: sampleIdea({ features: '盤面が変わる' }) })
    expect(md).toContain('## 特徴的なシステム\n盤面が変わる')
    expect(md.trimEnd().endsWith('## メモ\n協力プレイも面白そう')).toBe(true)
  })

  it('A モードの案は本文をそのまま「内容」に入れる', () => {
    const md = ideaToMarkdown({ ...base, source: 'human', body: null, title: '冷蔵庫の町', bodyText: '一行目\n二行目' })
    expect(md).toContain('## 内容\n一行目\n二行目')
  })

  it('複数の案は --- でつなぐ', () => {
    expect(ideasToMarkdown([base, { ...base, title: '二つ目' }]).split('\n---\n')).toHaveLength(2)
  })
})

describe('見出しの順（版 5）', () => {
  it('まず画面が思い浮かぶ順に並べ、ねらいは後ろ。古い案のリスクとリターンも出す', () => {
    const md = ideaToMarkdown({ ...base, body: { ...sampleIdea(), risk_return: '欲張ると潰れる' } })
    const order = ['## キャッチコピー', '## ひとことで', '## プレイの一場面', '## 悩みどころ', '## 欲張ると', '## 気持ちいい瞬間', '## ねらい'].map((h) => md.indexOf(h))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
