// 作業状態（design/04 §2）。再起動しても抽選・固定・下書きが戻るように 1 つにまとめて保存する（D-9）。
// 版 2（2026-11-05）: スロットを可変の並びにした。版 1（キーワード 2・ジャンル 1 の固定）も読んで直す
import {
  HISTORY_LIMIT,
  MANUAL_MAX_LENGTH,
  SLOT_KINDS,
  SLOT_LIMITS,
  parseCombination,
  type Combination,
  type DrawState,
  type Slot,
  type SlotKind
} from './draw'
import { isInt, isOneOf, isRecord, isString, isStringArray } from './validate'

export type Mode = 'human' | 'ai'

export type Draft = {
  title: string
  body: string
  /** 書き始めたときの組み合わせ（D-10）。空の下書きなら null */
  startedWith: Combination | null
  updatedAt: string
}

export type Workspace = {
  version: 2
  mode: Mode
  draw: DrawState
  draft: Draft
}

export const DRAFT_TITLE_MAX = 200
export const DRAFT_BODY_MAX = 20_000
const CATEGORY_ID_MAX = 50

export function emptyDraft(now: string): Draft {
  return { title: '', body: '', startedWith: null, updatedAt: now }
}

function parseSlot(v: unknown): Slot | null {
  if (!isRecord(v)) return null
  const { id, kind, value, source, categoryId, locked, categoryIds, history } = v
  if (!isString(id, 10, 1) || !isOneOf(kind, SLOT_KINDS) || !isString(value, MANUAL_MAX_LENGTH)) return null
  if (!isOneOf(source, ['draw', 'manual'] as const) || typeof locked !== 'boolean') return null
  if (!(categoryId === null || isString(categoryId, CATEGORY_ID_MAX))) return null
  if (!isStringArray(categoryIds, 100, CATEGORY_ID_MAX) || !isStringArray(history, HISTORY_LIMIT, MANUAL_MAX_LENGTH)) return null
  return { id, kind, value, source, categoryId, locked, categoryIds, history }
}

/** スロットの並びを検査する。ID の重複・数の範囲・並び（ジャンルが左）を確かめる */
function parseDraw(v: unknown): DrawState | null {
  if (!isRecord(v) || !Array.isArray(v['slots'])) return null
  const slots = v['slots'].map(parseSlot)
  if (slots.some((s) => s === null)) return null
  const list = slots as Slot[]
  if (new Set(list.map((s) => s.id)).size !== list.length) return null
  const count = (kind: SlotKind) => list.filter((s) => s.kind === kind).length
  if (SLOT_KINDS.some((k) => count(k) < SLOT_LIMITS[k].min || count(k) > SLOT_LIMITS[k].max)) return null
  const sorted = SLOT_KINDS.flatMap((k) => list.filter((s) => s.kind === k))
  if (sorted.some((s, i) => s !== list[i])) return null
  return { slots: list }
}

/** 版 1 の作業状態（slots・configs・history がキーワード 1・2・ジャンルの 3 つ）を版 2 の並びに直す */
function upgradeDrawV1(draw: Record<string, unknown>): DrawState | null {
  const slots = draw['slots']
  const configs = draw['configs']
  const history = draw['history']
  if (!isRecord(slots) || !isRecord(configs) || !isRecord(history)) return null
  const old: [string, SlotKind, string][] = [
    ['genre', 'genre', 'g1'],
    ['keyword1', 'keyword', 'k1'],
    ['keyword2', 'keyword', 'k2']
  ]
  const converted = old.map(([key, kind, id]) => {
    const s = slots[key]
    const c = configs[key]
    if (!isRecord(s) || !isRecord(c)) return null
    return parseSlot({ ...s, id, kind, categoryIds: c['categoryIds'], history: history[key] ?? [] })
  })
  if (converted.some((s) => s === null)) return null
  return { slots: converted as Slot[] }
}

/** 外から来た値を Workspace として読む。版 1 なら版 2 に直す。形が違えば null（呼び出し側は初期状態を使う） */
export function parseWorkspace(v: unknown): Workspace | null {
  if (!isRecord(v) || !isOneOf(v['mode'], ['human', 'ai'] as const)) return null
  const rawDraw = v['draw']
  const rawDraft = v['draft']
  if (!isRecord(rawDraw) || !isRecord(rawDraft)) return null

  let draw: DrawState | null
  if (isInt(v['version'], 2, 2)) draw = parseDraw(rawDraw)
  else if (isInt(v['version'], 1, 1)) draw = upgradeDrawV1(rawDraw)
  else return null
  if (!draw) return null

  const { title, body, startedWith, updatedAt } = rawDraft
  if (!isString(title, DRAFT_TITLE_MAX) || !isString(body, DRAFT_BODY_MAX) || !isString(updatedAt, 40)) return null
  const started = startedWith === null || startedWith === undefined ? null : parseCombination(startedWith)
  if (startedWith !== null && startedWith !== undefined && started === null) return null

  return { version: 2, mode: v['mode'], draw, draft: { title, body, startedWith: started, updatedAt } }
}
