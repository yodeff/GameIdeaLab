// 設定・作業状態・アイデアの読み書き。node:sqlite を直接触るのは src/main/storage だけ（DECISIONS/0004）。
import type { DatabaseSync } from 'node:sqlite'
import { bodyToText, type GameIdeaBody, type HumanIdeaInput, type IdeaRecord } from '@core/idea'
import type { Combination } from '@core/draw'
import type { Fidelity } from '@core/settings'
import { DEFAULT_SETTINGS, SETTING_KEYS, readSetting, type Settings } from '@core/settings'
import { parseWorkspace, type Workspace } from '@core/workspace'

// --- 設定 ---------------------------------------------------------------

export function getSettings(db: DatabaseSync): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const key of SETTING_KEYS) {
    const raw = stored.get(key)
    if (raw === undefined) continue
    try {
      settings[key] = readSetting(key, JSON.parse(raw))
    } catch {
      settings[key] = DEFAULT_SETTINGS[key]
    }
  }
  return settings as Settings
}

/** 検査済みの部分的な設定を書く（検査は呼び出し側で parseSettingsPatch） */
export function updateSettings(db: DatabaseSync, patch: Partial<Settings>): Settings {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  db.exec('BEGIN')
  try {
    for (const [key, value] of Object.entries(patch)) upsert.run(key, JSON.stringify(value))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return getSettings(db)
}

// --- 作業状態 -----------------------------------------------------------

export function loadWorkspace(db: DatabaseSync): Workspace | null {
  const row = db.prepare('SELECT value FROM workspace WHERE id = 1').get() as { value: string } | undefined
  if (!row) return null
  try {
    return parseWorkspace(JSON.parse(row.value))
  } catch {
    return null
  }
}

export function saveWorkspace(db: DatabaseSync, workspace: Workspace): void {
  db.prepare(
    'INSERT INTO workspace (id, version, value) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, value = excluded.value'
  ).run(workspace.version, JSON.stringify(workspace))
}

// --- アイデア -----------------------------------------------------------

type IdeaRow = {
  id: string
  created_at: string
  updated_at: string
  source: 'human' | 'ai'
  saved: number
  favorite: number
  title: string
  concept: string
  keyword1: string
  keyword2: string
  genre: string
  body_text: string
  body_json: string | null
  direction: string | null
  memo: string
  parent_id: string | null
  derivation: string | null
  generation_id: string | null
  model: string | null
  fidelity: string | null
  draw_context: string | null
}

function toRecord(row: IdeaRow): IdeaRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source,
    saved: row.saved === 1,
    favorite: row.favorite === 1,
    title: row.title,
    concept: row.concept,
    combination: { keyword1: row.keyword1, keyword2: row.keyword2, genre: row.genre },
    bodyText: row.body_text,
    body: row.body_json ? (JSON.parse(row.body_json) as IdeaRecord['body']) : null,
    direction: row.direction as IdeaRecord['direction'],
    memo: row.memo,
    parentId: row.parent_id,
    derivation: row.derivation,
    generationId: row.generation_id,
    model: row.model,
    fidelity: row.fidelity as IdeaRecord['fidelity'],
    drawContext: row.draw_context ? (JSON.parse(row.draw_context) as IdeaRecord['drawContext']) : null
  }
}

export function getIdea(db: DatabaseSync, id: string): IdeaRecord | null {
  const row = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id) as IdeaRow | undefined
  return row ? toRecord(row) : null
}

/** A モードの案を保存済みとして追加する（T-09） */
export function insertHumanIdea(db: DatabaseSync, input: HumanIdeaInput, id: string, now: string): IdeaRecord {
  db.prepare(
    `INSERT INTO ideas (id, created_at, updated_at, source, saved, title, keyword1, keyword2, genre, body_text)
     VALUES (?, ?, ?, 'human', 1, ?, ?, ?, ?, ?)`
  ).run(id, now, now, input.title, input.combination.keyword1, input.combination.keyword2, input.combination.genre, input.body)
  const record = getIdea(db, id)
  if (!record) throw new Error('保存した案を読み出せない')
  return record
}

export type AiIdeaInput = {
  body: GameIdeaBody
  combination: Combination
  generationId: string
  model: string
  fidelity: Fidelity
  parentId?: string
  derivation?: string
}

/** AI の案を履歴（未保存）として追加する（D-17） */
export function insertAiIdea(db: DatabaseSync, input: AiIdeaInput, id: string, now: string): IdeaRecord {
  const { body, combination: c } = input
  db.prepare(
    `INSERT INTO ideas (id, created_at, updated_at, source, saved, title, concept, keyword1, keyword2, genre,
       body_text, body_json, direction, parent_id, derivation, generation_id, model, fidelity)
     VALUES (?, ?, ?, 'ai', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    now,
    now,
    body.title,
    body.concept,
    c.keyword1,
    c.keyword2,
    c.genre,
    bodyToText(body),
    JSON.stringify(body),
    body.direction,
    input.parentId ?? null,
    input.derivation ?? null,
    input.generationId,
    input.model,
    input.fidelity
  )
  const record = getIdea(db, id)
  if (!record) throw new Error('保存した案を読み出せない')
  return record
}

export const HISTORY_KEEP = 200

/** 保存していない案を新しい順に keep 件だけ残す（D-17）。消した件数を返す */
export function pruneHistory(db: DatabaseSync, keep = HISTORY_KEEP): number {
  const result = db
    .prepare(
      `DELETE FROM ideas WHERE saved = 0 AND id NOT IN (
         SELECT id FROM ideas WHERE saved = 0 ORDER BY created_at DESC, rowid DESC LIMIT ?
       )`
    )
    .run(keep)
  return Number(result.changes)
}
