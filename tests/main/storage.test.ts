import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initialDrawState } from '@core/draw'
import { parseHumanIdeaInput } from '@core/idea'
import { DEFAULT_SETTINGS } from '@core/settings'
import { emptyDraft, type Workspace } from '@core/workspace'
import {
  BACKUP_KEEP,
  LATEST_VERSION,
  backupIfDue,
  getSettings,
  insertHumanIdea,
  listBackups,
  loadWorkspace,
  openDatabase,
  saveWorkspace,
  updateSettings
} from '../../src/main/storage'
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
      version: 1,
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
      combination: { keyword1: '冷蔵庫', keyword2: '町', genre: '育成ゲーム' }
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
      combination: { keyword1: '冷蔵庫', keyword2: '町', genre: '育成ゲーム' }
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
