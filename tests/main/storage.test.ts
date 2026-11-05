import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { initialDrawState } from '@core/draw'
import { parseHumanIdeaInput } from '@core/idea'
import { DEFAULT_SETTINGS } from '@core/settings'
import { emptyDraft, type Workspace } from '@core/workspace'
import {
  BACKUP_KEEP,
  beforeMigrationPath,
  LATEST_VERSION,
  backupIfDue,
  getIdea,
  getSettings,
  insertHumanIdea,
  listIdeas,
  listBackups,
  loadWorkspace,
  openDatabase,
  saveWorkspace,
  updateSettings
} from '../../src/main/storage'
import { MIGRATIONS } from '../../src/main/storage/migrations'
import { sequenceRng } from '../support/rng'
import keywords from '../../resources/dictionaries/keywords.ja.json'
import genres from '../../resources/dictionaries/genres.ja.json'
import type { KeywordDictionary } from '@core/dictionary'

const dictionaries = { keyword: keywords as KeywordDictionary, genre: genres as KeywordDictionary }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'gil-test-'))
  dirs.push(d)
  return d
}

describe('マイグレーション', () => {
  it('新しい DB を最新の版にする', () => {
    const db = openDatabase(':memory:')
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: LATEST_VERSION })
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name)
    expect(tables).toEqual(expect.arrayContaining(['ideas', 'settings', 'workspace']))
  })

  it('アプリより新しい版の DB は開かない', () => {
    const file = join(tempDir(), 'future.sqlite')
    const db = openDatabase(file)
    db.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`)
    db.close()
    expect(() => openDatabase(file)).toThrow(/新しい/)
  })

  it('版 1 の DB を開くと、組み合わせを配列の列に移す（ジャンル・キーワード 2 が空の案も）', () => {
    const file = join(tempDir(), 'v1.sqlite')
    const old = new DatabaseSync(file)
    old.exec(MIGRATIONS[0]?.sql ?? '')
    old.exec('PRAGMA user_version = 1')
    const insert = old.prepare(
      "INSERT INTO ideas (id, created_at, updated_at, source, saved, title, keyword1, keyword2, genre, body_text) VALUES (?, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', 'human', 1, ?, ?, ?, ?, '本文')"
    )
    insert.run('a', '冷蔵庫の町', '冷蔵庫', '町', '育成ゲーム')
    insert.run('b', '鍵だけ', '鍵', '', '')
    old.close()

    const db = openDatabase(file)
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: LATEST_VERSION })
    // 版を上げる前の写しが残り、版 1 のまま開ける
    const copy = new DatabaseSync(beforeMigrationPath(file), { readOnly: true })
    expect(copy.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
    expect(copy.prepare('SELECT count(*) AS n FROM ideas').get()).toEqual({ n: 2 })
    copy.close()
    expect(getIdea(db, 'a')?.combination).toEqual({ genres: ['育成ゲーム'], keywords: ['冷蔵庫', '町'] })
    expect(getIdea(db, 'b')?.combination).toEqual({ genres: [], keywords: ['鍵'] })
    const q = { scope: 'saved' as const, text: '', genre: null, favoritesOnly: false, limit: 10 }
    expect(listIdeas(db, { ...q, genre: '育成ゲーム' }).ideas.map((i) => i.id)).toEqual(['a'])
    expect(listIdeas(db, { ...q, text: '町' }).ideas.map((i) => i.id)).toEqual(['a'])
    expect(listIdeas(db, q).genres).toEqual(['育成ゲーム'])
    db.close()
  })
})

describe('設定', () => {
  it('何も保存していなければ初期値', () => {
    expect(getSettings(openDatabase(':memory:'))).toEqual(DEFAULT_SETTINGS)
  })

  it('書いた項目だけが変わり、壊れた値は初期値に戻る', () => {
    const db = openDatabase(':memory:')
    expect(updateSettings(db, { aiCount: 5, theme: 'dark' })).toEqual({ ...DEFAULT_SETTINGS, aiCount: 5, theme: 'dark' })
    db.prepare("UPDATE settings SET value = '99' WHERE key = 'aiCount'").run()
    db.prepare("INSERT INTO settings (key, value) VALUES ('aiFidelity', '{broken')").run()
    expect(getSettings(db)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })
})

describe('作業状態', () => {
  it('保存したものをそのまま読み出す', () => {
    const db = openDatabase(':memory:')
    expect(loadWorkspace(db)).toBeNull()
    const ws: Workspace = {
      version: 2,
      mode: 'human',
      draw: initialDrawState(dictionaries, sequenceRng([0.1, 0.5, 0.9])),
      draft: { ...emptyDraft('2026-11-05T00:00:00.000Z'), body: '書きかけ' }
    }
    saveWorkspace(db, ws)
    saveWorkspace(db, { ...ws, mode: 'ai' })
    expect(loadWorkspace(db)).toEqual({ ...ws, mode: 'ai' })
  })

  it('壊れた作業状態は null（初期状態から始める）', () => {
    const db = openDatabase(':memory:')
    db.prepare("INSERT INTO workspace (id, version, value) VALUES (1, 1, '{\"version\":1}')").run()
    expect(loadWorkspace(db)).toBeNull()
  })
})

describe('A モードの案', () => {
  it('保存済みとして追加する', () => {
    const db = openDatabase(':memory:')
    const input = parseHumanIdeaInput({
      title: '',
      body: '冷蔵庫で町を育てる\n詳細',
      combination: { genres: ['育成ゲーム'], keywords: ['冷蔵庫', '町'] }
    })
    if (!input) throw new Error('入力が不正')
    const record = insertHumanIdea(db, input, 'id-1', '2026-11-05T00:00:00.000Z')
    expect(record).toMatchObject({
      id: 'id-1',
      source: 'human',
      saved: true,
      favorite: false,
      title: '冷蔵庫で町を育てる',
      bodyText: '冷蔵庫で町を育てる\n詳細',
      body: null,
      combination: { genres: ['育成ゲーム'], keywords: ['冷蔵庫', '町'] }
    })
  })
})

describe('起動時の控え', () => {
  it('24 時間たっていなければ作らず、新しい 7 つだけを残す', () => {
    const dir = tempDir()
    const db = openDatabase(join(tempDir(), 'main.sqlite'))
    for (let day = 1; day <= 9; day++) writeFileSync(join(dir, `game-idea-lab-202611${String(day).padStart(2, '0')}-120000.sqlite`), '')
    writeFileSync(join(dir, 'unrelated.txt'), '')

    expect(backupIfDue(db, dir, new Date(2026, 10, 9, 13, 0, 0))).toBeNull()
    const made = backupIfDue(db, dir, new Date(2026, 10, 10, 12, 30, 0))
    expect(made).toBe('game-idea-lab-20261110-123000.sqlite')
    const kept = listBackups(dir).map((b) => b.name)
    expect(kept).toHaveLength(BACKUP_KEEP)
    expect(kept[0]).toBe(made)
    expect(kept.at(-1)).toBe('game-idea-lab-20261104-120000.sqlite')
    db.close()
  })
})
