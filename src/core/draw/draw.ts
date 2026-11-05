// キーワードとジャンルの抽選（design/04 §1.1〜1.2）。純粋な関数で、状態は新しいオブジェクトで返す。
// 2026-11-05: スロットの数を可変にした（ジャンル 0〜3、キーワード 1〜5。並びはジャンルが左）。
//   メンテナー「ジャンルを一番左において、キーワードもジャンルも可変式に」（LEARNINGS L-21）
import { nonEmptyCategories, type KeywordCategory, type KeywordDictionary } from '../dictionary'
import { pickOne, type Rng } from '../random'

export type SlotKind = 'genre' | 'keyword'
export const SLOT_KINDS: readonly SlotKind[] = ['genre', 'keyword']

/** スロットの数の範囲と、最初の数 */
export const SLOT_LIMITS: Record<SlotKind, { min: number; max: number; initial: number }> = {
  genre: { min: 0, max: 3, initial: 1 },
  keyword: { min: 1, max: 5, initial: 2 }
}

export type Slot = {
  /** スロットを見分ける ID（g1, k2 など）。並びが変わっても変わらない */
  id: string
  kind: SlotKind
  value: string
  source: 'draw' | 'manual'
  /** 手動入力なら null */
  categoryId: string | null
  locked: boolean
  /** 抽選するカテゴリ。空なら「すべて」（D-1） */
  categoryIds: string[]
  /** 直近の語。新しい順（D-3） */
  history: string[]
}

/** スロットの並び。ジャンルが左、キーワードが右 */
export type DrawState = { slots: Slot[] }

/** 抽選の結果。ジャンルが 0 個なら「ジャンルは自由」 */
export type Combination = { genres: string[]; keywords: string[] }

export type Dictionaries = { keyword: KeywordDictionary; genre: KeywordDictionary }

/** 同じスロットでなるべく避ける直近の語の数（D-3） */
export const HISTORY_LIMIT = 20
/** 手動入力の長さの上限 */
export const MANUAL_MAX_LENGTH = 50

export function dictionaryFor(kind: SlotKind, dictionaries: Dictionaries): KeywordDictionary {
  return kind === 'genre' ? dictionaries.genre : dictionaries.keyword
}

export const slotsOf = (state: DrawState, kind: SlotKind): Slot[] => state.slots.filter((s) => s.kind === kind)

/** ジャンルを左、キーワードを右に並べ直す（同じ種類の中の順は保つ） */
function ordered(slots: Slot[]): Slot[] {
  return SLOT_KINDS.flatMap((kind) => slots.filter((s) => s.kind === kind))
}

/** 抽選の対象にするカテゴリ。選んだものが空ならすべて（D-1）、単語の無いものは除く（D-2） */
export function candidateCategories(dictionary: KeywordDictionary, categoryIds: readonly string[]): KeywordCategory[] {
  const all = nonEmptyCategories(dictionary)
  if (categoryIds.length === 0) return all
  const selected = all.filter((c) => categoryIds.includes(c.id))
  return selected.length > 0 ? selected : all
}

/**
 * 1 語を選ぶ。カテゴリを均等に選び、その中から均等に選ぶ（企画書 §5.6）。
 * 除外は強いもの（同じ種類のほかのスロットの語）から順に緩める。選べなければ null。
 */
export function drawWord(
  categories: readonly KeywordCategory[],
  exclusionTiers: readonly ReadonlySet<string>[],
  rng: Rng
): { value: string; categoryId: string } | null {
  for (const excluded of exclusionTiers) {
    const available = categories
      .map((c) => ({ id: c.id, words: c.words.filter((w) => !excluded.has(w)) }))
      .filter((c) => c.words.length > 0)
    if (available.length === 0) continue
    const category = pickOne(rng, available)
    return { value: pickOne(rng, category.words), categoryId: category.id }
  }
  return null
}

function replaceSlot(state: DrawState, id: string, update: (s: Slot) => Slot): DrawState {
  return { slots: state.slots.map((s) => (s.id === id ? update(s) : s)) }
}

/** 1 つのスロットを引き直す。固定していても引き直す（固定は一括抽選から守るためのもの） */
export function drawSlot(state: DrawState, id: string, dictionaries: Dictionaries, rng: Rng): DrawState {
  const slot = state.slots.find((s) => s.id === id)
  if (!slot) return state
  const categories = candidateCategories(dictionaryFor(slot.kind, dictionaries), slot.categoryIds)
  // 同じ組み合わせの中で同じ語を出さない（必須）。同じスロットの直近の語はなるべく避ける
  const required = new Set(state.slots.filter((s) => s.kind === slot.kind && s.id !== id && s.value).map((s) => s.value))
  const soft = new Set([...required, ...slot.history, slot.value].filter(Boolean))
  const picked = drawWord(categories, [soft, required], rng)
  if (!picked) return state
  return replaceSlot(state, id, (s) => ({
    ...s,
    value: picked.value,
    source: 'draw',
    categoryId: picked.categoryId,
    history: [picked.value, ...s.history].slice(0, HISTORY_LIMIT)
  }))
}

/** 固定していないスロットを左から順に引く */
export function drawAll(state: DrawState, dictionaries: Dictionaries, rng: Rng): DrawState {
  return state.slots.reduce((s, slot) => (slot.locked ? s : drawSlot(s, slot.id, dictionaries, rng)), state)
}

/** 新しいスロットの ID（種類ごとに、いまある最大の番号 + 1） */
function nextId(state: DrawState, kind: SlotKind): string {
  const prefix = kind === 'genre' ? 'g' : 'k'
  const used = state.slots.filter((s) => s.kind === kind).map((s) => Number(s.id.slice(1)) || 0)
  return `${prefix}${Math.max(0, ...used) + 1}`
}

function emptySlot(id: string, kind: SlotKind): Slot {
  return { id, kind, value: '', source: 'draw', categoryId: null, locked: false, categoryIds: [], history: [] }
}

/** スロットを足して、すぐに引く。上限なら何もしない */
export function addSlot(state: DrawState, kind: SlotKind, dictionaries: Dictionaries, rng: Rng): DrawState {
  if (slotsOf(state, kind).length >= SLOT_LIMITS[kind].max) return state
  const id = nextId(state, kind)
  return drawSlot({ slots: ordered([...state.slots, emptySlot(id, kind)]) }, id, dictionaries, rng)
}

/** スロットを外す。下限なら何もしない */
export function removeSlot(state: DrawState, id: string): DrawState {
  const slot = state.slots.find((s) => s.id === id)
  if (!slot || slotsOf(state, slot.kind).length <= SLOT_LIMITS[slot.kind].min) return state
  return { slots: state.slots.filter((s) => s.id !== id) }
}

/** 最初の状態。ジャンル 1・キーワード 2 を「すべてのカテゴリ」で引く */
export function initialDrawState(dictionaries: Dictionaries, rng: Rng): DrawState {
  let state: DrawState = { slots: [] }
  for (const kind of SLOT_KINDS) {
    for (let i = 0; i < SLOT_LIMITS[kind].initial; i++) state = addSlot(state, kind, dictionaries, rng)
  }
  return state
}

/** 手動入力。前後の空白を除き、自動で固定する（D-4）。空や長すぎる語は受け付けない */
export function setManualValue(state: DrawState, id: string, input: string): DrawState {
  const value = input.trim()
  if (value === '' || value.length > MANUAL_MAX_LENGTH) return state
  return replaceSlot(state, id, (s) => ({ ...s, value, source: 'manual', categoryId: null, locked: true }))
}

export function setLocked(state: DrawState, id: string, locked: boolean): DrawState {
  return replaceSlot(state, id, (s) => ({ ...s, locked }))
}

export function setCategories(state: DrawState, id: string, categoryIds: string[]): DrawState {
  return replaceSlot(state, id, (s) => ({ ...s, categoryIds: [...new Set(categoryIds)] }))
}

export function combinationOf(state: DrawState): Combination {
  return {
    genres: slotsOf(state, 'genre').map((s) => s.value).filter(Boolean),
    keywords: slotsOf(state, 'keyword').map((s) => s.value).filter(Boolean)
  }
}

export function sameCombination(a: Combination, b: Combination): boolean {
  return a.genres.join('\u0000') === b.genres.join('\u0000') && a.keywords.join('\u0000') === b.keywords.join('\u0000')
}
