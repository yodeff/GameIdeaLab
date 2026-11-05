// キーワードとジャンルの抽選（design/04 §1.1〜1.2）。純粋な関数で、状態は新しいオブジェクトで返す。
import { nonEmptyCategories, type KeywordCategory, type KeywordDictionary } from '../dictionary'
import { pickOne, type Rng } from '../random'

export type SlotId = 'keyword1' | 'keyword2' | 'genre'
export const SLOT_IDS: readonly SlotId[] = ['keyword1', 'keyword2', 'genre']

export type Combination = Record<SlotId, string>

/** categoryIds が空なら「すべて」（D-1） */
export type SlotConfig = { categoryIds: string[] }

export type SlotState = {
  value: string
  source: 'draw' | 'manual'
  /** 手動入力なら null */
  categoryId: string | null
  locked: boolean
}

/** スロットごとの直近の語。新しい順 */
export type DrawHistory = Record<SlotId, string[]>

export type DrawState = {
  slots: Record<SlotId, SlotState>
  configs: Record<SlotId, SlotConfig>
  history: DrawHistory
}

export type Dictionaries = { keyword: KeywordDictionary; genre: KeywordDictionary }

/** 同じスロットでなるべく避ける直近の語の数（D-3） */
export const HISTORY_LIMIT = 20
/** 手動入力の長さの上限 */
export const MANUAL_MAX_LENGTH = 50

const EMPTY_SLOT: SlotState = { value: '', source: 'draw', categoryId: null, locked: false }

export function dictionaryFor(slot: SlotId, dictionaries: Dictionaries): KeywordDictionary {
  return slot === 'genre' ? dictionaries.genre : dictionaries.keyword
}

/** 抽選の対象にするカテゴリ。選んだものが空ならすべて（D-1）、単語の無いものは除く（D-2） */
export function candidateCategories(dictionary: KeywordDictionary, config: SlotConfig): KeywordCategory[] {
  const all = nonEmptyCategories(dictionary)
  if (config.categoryIds.length === 0) return all
  const selected = all.filter((c) => config.categoryIds.includes(c.id))
  return selected.length > 0 ? selected : all
}

/**
 * 1 語を選ぶ。カテゴリを均等に選び、その中から均等に選ぶ（企画書 §5.6）。
 * 除外は強いもの（もう一方のキーワード）から順に緩める。選べなければ null。
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

function otherKeyword(slot: SlotId, slots: DrawState['slots']): string | null {
  if (slot === 'keyword1') return slots.keyword2.value || null
  if (slot === 'keyword2') return slots.keyword1.value || null
  return null
}

/** 1 つのスロットを引き直す。固定していても引き直す（固定は一括抽選から守るためのもの） */
export function drawSlot(state: DrawState, slot: SlotId, dictionaries: Dictionaries, rng: Rng): DrawState {
  const categories = candidateCategories(dictionaryFor(slot, dictionaries), state.configs[slot])
  const other = otherKeyword(slot, state.slots)
  const required = new Set(other ? [other] : [])
  const soft = new Set([...required, ...state.history[slot], state.slots[slot].value].filter(Boolean))
  const picked = drawWord(categories, [soft, required], rng)
  if (!picked) return state

  return {
    ...state,
    slots: {
      ...state.slots,
      [slot]: { ...state.slots[slot], value: picked.value, source: 'draw', categoryId: picked.categoryId }
    },
    history: { ...state.history, [slot]: [picked.value, ...state.history[slot]].slice(0, HISTORY_LIMIT) }
  }
}

/** 固定していないスロットを keyword1 → keyword2 → genre の順に引く */
export function drawAll(state: DrawState, dictionaries: Dictionaries, rng: Rng): DrawState {
  return SLOT_IDS.reduce((s, slot) => (s.slots[slot].locked ? s : drawSlot(s, slot, dictionaries, rng)), state)
}

/** 最初の状態。すべてのスロットを「すべてのカテゴリ」で引く */
export function initialDrawState(dictionaries: Dictionaries, rng: Rng): DrawState {
  const empty: DrawState = {
    slots: { keyword1: EMPTY_SLOT, keyword2: EMPTY_SLOT, genre: EMPTY_SLOT },
    configs: { keyword1: { categoryIds: [] }, keyword2: { categoryIds: [] }, genre: { categoryIds: [] } },
    history: { keyword1: [], keyword2: [], genre: [] }
  }
  return drawAll(empty, dictionaries, rng)
}

/** 手動入力。前後の空白を除き、自動で固定する（D-4）。空や長すぎる語は受け付けない */
export function setManualValue(state: DrawState, slot: SlotId, input: string): DrawState {
  const value = input.trim()
  if (value === '' || value.length > MANUAL_MAX_LENGTH) return state
  return {
    ...state,
    slots: { ...state.slots, [slot]: { value, source: 'manual', categoryId: null, locked: true } }
  }
}

export function setLocked(state: DrawState, slot: SlotId, locked: boolean): DrawState {
  return { ...state, slots: { ...state.slots, [slot]: { ...state.slots[slot], locked } } }
}

export function setCategories(state: DrawState, slot: SlotId, categoryIds: string[]): DrawState {
  return { ...state, configs: { ...state.configs, [slot]: { categoryIds: [...new Set(categoryIds)] } } }
}

export function combinationOf(slots: DrawState['slots']): Combination {
  return { keyword1: slots.keyword1.value, keyword2: slots.keyword2.value, genre: slots.genre.value }
}
