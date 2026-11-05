import { existsSync, mkdtempSync, openSync, readdirSync, rmSync, writeSync, closeSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getSettings, insertAiIdea, isHealthy, openDatabase, recoverDatabase, saveWorkspace, updateSettings } from '../../src/main/storage'
import { initialDrawState } from '@core/draw'
import { emptyDraft } from '@core/workspace'
import { sampleIdea } from '../support/ideas'
import { sequenceRng } from '../support/rng'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const dictionaries = {
  keyword: { schemaVersion: 1 as const, kind: 'keyword' as const, categories: [{ id: 'a', label: 'A', words: ['鍵', '扉'] }] },
  genre: { schemaVersion: 1 as const, kind: 'genre' as const, categories: [{ id: 'g', label: 'G', words: ['パズル'] }] }
}

/** 設定・作業状態・案 120 件を持つ DB を作り、閉じる（WAL を本体へ書き戻す） */
function makeDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gil-recover-'))
  dirs.push(dir)
  const path = join(dir, 'game-idea-lab.sqlite')
  const db = openDatabase(path)
  updateSettings(db, { aiCount: 5, theme: 'dark' })
  saveWorkspace(db, { version: 1, mode: 'ai', draw: initialDrawState(dictionaries, sequenceRng([0.3])), draft: emptyDraft('2026-11-05T00:00:00.000Z') })
  for (let i = 0; i < 120; i++) {
    insertAiIdea(
      db,
      { body: sampleIdea({ title: `案${i}`, scene: 'あ'.repeat(400) }), combination: { keyword1: '鍵', keyword2: '扉', genre: 'パズル' }, generationId: 'g', model: 'm', fidelity: 'standard' },
      `id-${i}`,
      new Date(Date.UTC(2026, 10, 5, 0, 0, i)).toISOString()
    )
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.close()
  return path
}

/** 本体の途中のページをでたらめな値で上書きする */
function corruptMiddle(path: string): void {
  const size = statSync(path).size
  const fd = openSync(path, 'r+')
  writeSync(fd, Buffer.alloc(4096, 0xab), 0, 4096, Math.floor(size / 2 / 4096) * 4096)
  closeSync(fd)
}

describe('保存データの検査と救出（LEARNINGS L-20）', () => {
  it('健全な DB は ok、壊した DB は ng', () => {
    const path = makeDb()
    expect(isHealthy(path)).toBe(true)
    corruptMiddle(path)
    expect(isHealthy(path)).toBe(false)
  })

  it('壊れた DB を脇へ移し、設定・作業状態と読める案を新しい DB へ移す', () => {
    const path = makeDb()
    corruptMiddle(path)
    const report = recoverDatabase(path, new Date('2026-11-05T07:00:00.000Z'))
    expect(existsSync(report.movedTo)).toBe(true) // 消していない
    expect(readdirSync(join(path, '..')).some((f) => f.includes('.corrupt-'))).toBe(true)
    expect(report.settings).toBe(2)
    expect(report.workspace).toBe(true)
    expect(report.ideas).toBeGreaterThan(0)
    expect(report.ideas).toBeLessThanOrEqual(120)
    expect(isHealthy(path)).toBe(true)
    const db = openDatabase(path)
    expect(getSettings(db)).toMatchObject({ aiCount: 5, theme: 'dark' })
    expect((db.prepare('SELECT count(*) AS n FROM ideas').get() as { n: number }).n).toBe(report.ideas)
    db.close()
  })

  it('まったく開けないファイルでも、新しい DB で起動できる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gil-recover-'))
    dirs.push(dir)
    const path = join(dir, 'game-idea-lab.sqlite')
    const fd = openSync(path, 'w')
    writeSync(fd, Buffer.from('これは SQLite ではない'))
    closeSync(fd)
    expect(isHealthy(path)).toBe(false)
    expect(recoverDatabase(path, new Date())).toMatchObject({ settings: 0, workspace: false, ideas: 0 })
    expect(isHealthy(path)).toBe(true)
  })
})
