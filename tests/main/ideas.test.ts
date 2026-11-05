import { describe, expect, it } from 'vitest'
import { matchesQuery, parseIdeaListQuery, parseIdeaPatch, type IdeaListQuery } from '@core/idea'
import {
  deleteIdea,
  getIdea,
  insertAiIdea,
  insertHumanIdea,
  latestGeneration,
  listIdeas,
  openDatabase,
  updateIdea
} from '../../src/main/storage'
import { sampleIdea } from '../support/ideas'

const query = (q: Partial<IdeaListQuery> = {}): IdeaListQuery => ({ scope: 'saved', text: '', genre: null, favoritesOnly: false, limit: 100, ...q })
const ts = (s: number) => new Date(Date.UTC(2026, 10, 5, 0, 0, s)).toISOString()

function seed() {
  const db = openDatabase(':memory:')
  const human = insertHumanIdea(
    db,
    { title: '冷蔵庫の町', body: '冷やすほど町が静かになる 100%_ジョーク', combination: { keyword1: '冷蔵庫', keyword2: '町', genre: '育成ゲーム' } },
    'h1',
    ts(1)
  )
  const ai = (id: string, s: number, title: string, genre = 'パズル', generationId = 'g1', parentId?: string) =>
    insertAiIdea(
      db,
      {
        body: sampleIdea({ title }),
        combination: { keyword1: '鍵', keyword2: '扉', genre },
        generationId,
        model: 'm',
        fidelity: 'standard',
        ...(parentId ? { parentId, derivation: 'もっと独創的に' } : {})
      },
      id,
      ts(s)
    )
  ai('a1', 2, '鍵のパズル')
  ai('a2', 3, '扉のステルス', 'ステルス')
  ai('b1', 10, '新しい生成', 'パズル', 'g2')
  ai('d1', 11, '派生した案', 'パズル', 'g3', 'b1')
  return { db, human }
}

describe('一覧（T-20）', () => {
  it('保存済みと履歴を分け、新しい順に返す', () => {
    const { db } = seed()
    expect(listIdeas(db, query()).ideas.map((i) => i.id)).toEqual(['h1'])
    const history = listIdeas(db, query({ scope: 'history' }))
    expect(history.ideas.map((i) => i.id)).toEqual(['d1', 'b1', 'a2', 'a1'])
    expect(history.total).toBe(4)
    expect(history.genres).toEqual(['ステルス', 'パズル'])
  })

  it('部分一致はタイトル・キーワード・本文・メモを見て、% と _ を文字として扱う', () => {
    const { db } = seed()
    expect(listIdeas(db, query({ text: '静か' })).ideas.map((i) => i.id)).toEqual(['h1'])
    expect(listIdeas(db, query({ text: '100%_' })).ideas.map((i) => i.id)).toEqual(['h1'])
    expect(listIdeas(db, query({ text: '%' , scope: 'history' })).ideas).toEqual([])
    updateIdea(db, 'a1', { memo: '協力プレイも' }, ts(20))
    expect(listIdeas(db, query({ scope: 'history', text: '協力' })).ideas.map((i) => i.id)).toEqual(['a1'])
  })

  it('ジャンルとお気に入りで絞り、limit を超える分は total にだけ数える', () => {
    const { db } = seed()
    expect(listIdeas(db, query({ scope: 'history', genre: 'ステルス' })).ideas.map((i) => i.id)).toEqual(['a2'])
    const limited = listIdeas(db, query({ scope: 'history', limit: 2 }))
    expect(limited.ideas).toHaveLength(2)
    expect(limited.total).toBe(4)
  })
})

describe('更新と削除（design/04 §4）', () => {
  it('お気に入りにすると保存済みになり、履歴に戻すとお気に入りが外れる', () => {
    const { db } = seed()
    expect(updateIdea(db, 'a1', { favorite: true }, ts(30))).toMatchObject({ saved: true, favorite: true, updatedAt: ts(30) })
    expect(listIdeas(db, query({ favoritesOnly: true })).ideas.map((i) => i.id)).toEqual(['a1'])
    expect(updateIdea(db, 'a1', { saved: false }, ts(31))).toMatchObject({ saved: false, favorite: false })
  })

  it('メモとタイトルを書き換え、無い ID は null', () => {
    const { db } = seed()
    expect(updateIdea(db, 'h1', { memo: 'メモ', title: '新しい題' }, ts(40))).toMatchObject({ memo: 'メモ', title: '新しい題' })
    expect(updateIdea(db, 'nope', { memo: 'x' }, ts(40))).toBeNull()
  })

  it('削除すると派生案は残り、元の ID が外れる', () => {
    const { db } = seed()
    expect(deleteIdea(db, 'b1')).toBe(true)
    expect(getIdea(db, 'b1')).toBeNull()
    expect(getIdea(db, 'd1')?.parentId).toBeNull()
    expect(deleteIdea(db, 'b1')).toBe(false)
  })

  it('最後の生成とその派生を返す（再起動後の B モード）', () => {
    const { db } = seed()
    expect(latestGeneration(db).map((i) => i.id)).toEqual(['b1', 'd1'])
    expect(latestGeneration(openDatabase(':memory:'))).toEqual([])
  })
})

describe('入力の検査', () => {
  it.each([
    [{ scope: 'saved', text: '', genre: null, favoritesOnly: false, limit: 0 }],
    [{ scope: 'all', text: '', genre: null, favoritesOnly: false, limit: 10 }],
    [{ scope: 'saved', text: 'x'.repeat(101), genre: null, favoritesOnly: false, limit: 10 }]
  ])('不正な一覧の条件 %j は null', (v) => {
    expect(parseIdeaListQuery(v)).toBeNull()
  })

  it.each([{}, { memo: 'x'.repeat(10_001) }, { title: '  ' }, { favorite: 'yes' }, { other: 1 }])('不正な更新 %j は null', (v) => {
    expect(parseIdeaPatch(v)).toBeNull()
  })

  it('ブラウザ用の絞り込みは SQLite と同じ規則', () => {
    const { db } = seed()
    const all = [...listIdeas(db, query()).ideas, ...listIdeas(db, query({ scope: 'history' })).ideas]
    for (const q of [query({ text: '鍵' }), query({ scope: 'history', text: '扉' }), query({ scope: 'history', genre: 'パズル' })]) {
      expect(all.filter((i) => matchesQuery(i, q)).map((i) => i.id).sort()).toEqual(listIdeas(db, q).ideas.map((i) => i.id).sort())
    }
  })
})
