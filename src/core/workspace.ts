// 作業状態（design/04 §2）。再起動しても抽選・固定・下書きが戻るように 1 つにまとめて保存する（D-9）。
import {
  HISTORY_LIMIT,
  MANUAL_MAX_LENGTH,
  SLOT_IDS,
  type Combination,
  type DrawState,
  type SlotConfig,
  type SlotId,
  type SlotState
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
  version: 1
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

function parseCombination(v: unknown): Combination | null {
  if (!isRecord(v)) return null
  const ok = SLOT_IDS.every((slot) => isString(v[slot], MANUAL_MAX_LENGTH))
  return ok ? { keyword1: v['keyword1'] as string, keyword2: v['keyword2'] as string, genre: v['genre'] as string } : null
}

function parseSlotState(v: unknown): SlotState | null {
  if (!isRecord(v)) return null
  const { value, source, categoryId, locked } = v
  if (!isString(value, MANUAL_MAX_LENGTH) || !isOneOf(source, ['draw', 'manual'] as const)) return null
  if (!(categoryId === null || isString(categoryId, CATEGORY_ID_MAX)) || typeof locked !== 'boolean') return null
  return { value, source, categoryId, locked }
}

function parseSlotConfig(v: unknown): SlotConfig | null {
  if (!isRecord(v) || !isStringArray(v['categoryIds'], 100, CATEGORY_ID_MAX)) return null
  return { categoryIds: v['categoryIds'] }
}

function parsePerSlot<T>(v: unknown, parse: (x: unknown) => T | null): Record<SlotId, T> | null {
  if (!isRecord(v)) return null
  const entries = SLOT_IDS.map((slot) => [slot, parse(v[slot])] as const)
  if (entries.some(([, value]) => value === null)) return null
  return Object.fromEntries(entries) as Record<SlotId, T>
}

/** 外から来た値を Workspace として読む。形が違えば null（呼び出し側は初期状態を使う） */
export function parseWorkspace(v: unknown): Workspace | null {
  if (!isRecord(v) || !isInt(v['version'], 1, 1) || !isOneOf(v['mode'], ['human', 'ai'] as const)) return null
  const draw = v['draw']
  const draft = v['draft']
  if (!isRecord(draw) || !isRecord(draft)) return null

  const slots = parsePerSlot(draw['slots'], parseSlotState)
  const configs = parsePerSlot(draw['configs'], parseSlotConfig)
  const history = parsePerSlot(draw['history'], (h) => (isStringArray(h, HISTORY_LIMIT, MANUAL_MAX_LENGTH) ? h : null))
  if (!slots || !configs || !history) return null

  const { title, body, startedWith, updatedAt } = draft
  if (!isString(title, DRAFT_TITLE_MAX) || !isString(body, DRAFT_BODY_MAX) || !isString(updatedAt, 40)) return null
  const started = startedWith === null ? null : parseCombination(startedWith)
  if (startedWith !== null && started === null) return null

  return {
    version: 1,
    mode: v['mode'],
    draw: { slots, configs, history },
    draft: { title, body, startedWith: started, updatedAt }
  }
}
