// アイデアの型（design/04 §3.1・§4）。
import { parseCombination, type Combination } from '../draw'
import type { Fidelity } from '../settings'
import { isRecord, isString } from '../validate'

export type Direction = '王道' | '変化球' | '実験的'
export const DIRECTIONS: readonly Direction[] = ['王道', '変化球', '実験的']

/** AI の案の項目（企画書 §7.3）。ジャンルとキーワードは AI に書かせず、アプリが付ける */
export type GameIdeaBody = {
  direction: Direction
  title: string
  /** ねらい。この組み合わせとジャンルで立てた課題（版 3 で追加。コンセプトはその解き方） */
  problem: string
  /** キャッチコピー（版 5 で追加） */
  catch_copy: string
  concept: string
  /** プレイの一場面。画面・操作・結果（版 5 で追加） */
  scene: string
  /** 画面。視点と、何がどこに見えるか（版 5 で追加） */
  screen: string
  /** どんなゲームか（版 1〜4。版 5 からは「ひとことで」と「画面」に分けたので、古い案だけが持つ） */
  overview?: string | null
  player_actions: string
  goal: string
  /** プレイヤーが毎回迷う選択（版 2 で追加） */
  core_choice: string
  /** 何を冒すほど何が得られるか（版 2〜4。版 5 からは悩みどころにまとめたので、古い案だけが持つ） */
  risk_return?: string | null
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
  /** 抽選の条件（スロットごとのカテゴリ）。今は使っていない */
  drawContext: Record<string, string[]> | null
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
  const combination = parseCombination(v['combination'])
  if (!combination) return null
  const body = v['body'].trim()
  if (body === '') return null
  const firstLine = body.split(/\r?\n/)[0]?.trim() ?? ''
  const title = v['title'].trim() || [...firstLine].slice(0, AUTO_TITLE_LENGTH).join('')
  return {
    title,
    body,
    combination
  }
}
