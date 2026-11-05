// アイデアの型（design/04 §3.1・§4）。
import { MANUAL_MAX_LENGTH, SLOT_IDS, type Combination, type SlotConfig, type SlotId } from '../draw'
import type { Fidelity } from '../settings'
import { isRecord, isString } from '../validate'

export type Direction = '王道' | '変化球' | '実験的'
export const DIRECTIONS: readonly Direction[] = ['王道', '変化球', '実験的']

/** AI の案の項目（企画書 §7.3）。ジャンルとキーワードは AI に書かせず、アプリが付ける */
export type GameIdeaBody = {
  direction: Direction
  title: string
  /** この組み合わせとジャンルで立てた課題（版 3 で追加。コンセプトはその解き方） */
  problem: string
  concept: string
  overview: string
  player_actions: string
  goal: string
  /** プレイヤーが毎回迷う選択（版 2 で追加） */
  core_choice: string
  /** 何を冒すほど何が得られるか（版 2 で追加） */
  risk_return: string
  core_loop: string
  fun_core: string
  keyword_mechanics: string
  features: string | null
  challenges: string | null
  prototype: string | null
}

export type IdeaRecord = {
  id: string
  createdAt: string
  updatedAt: string
  source: 'human' | 'ai'
  /** false = 履歴（未保存） */
  saved: boolean
  favorite: boolean
  title: string
  concept: string
  combination: Combination
  /** A モードの本文。AI の案は検索用に全項目をつないだ文 */
  bodyText: string
  /** AI の案の項目。A モードは null */
  body: GameIdeaBody | null
  direction: Direction | null
  memo: string
  parentId: string | null
  derivation: string | null
  generationId: string | null
  model: string | null
  fidelity: Fidelity | null
  drawContext: Record<SlotId, SlotConfig> | null
}

export type HumanIdeaInput = {
  title: string
  body: string
  combination: Combination
}

export const IDEA_TITLE_MAX = 200
export const IDEA_BODY_MAX = 20_000
/** タイトルが空のとき本文の 1 行目から作る長さ（D-11） */
const AUTO_TITLE_LENGTH = 40

/** A モードの保存の入力を検査し、タイトルを補う。不正なら null */
export function parseHumanIdeaInput(v: unknown): HumanIdeaInput | null {
  if (!isRecord(v) || !isString(v['title'], IDEA_TITLE_MAX) || !isString(v['body'], IDEA_BODY_MAX)) return null
  const c = v['combination']
  if (!isRecord(c) || !SLOT_IDS.every((slot) => isString(c[slot], MANUAL_MAX_LENGTH, 1))) return null
  const body = v['body'].trim()
  if (body === '') return null
  const firstLine = body.split(/\r?\n/)[0]?.trim() ?? ''
  const title = v['title'].trim() || [...firstLine].slice(0, AUTO_TITLE_LENGTH).join('')
  return {
    title,
    body,
    combination: { keyword1: c['keyword1'] as string, keyword2: c['keyword2'] as string, genre: c['genre'] as string }
  }
}
