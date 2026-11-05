// AI の案の項目の検査と、検索・表示に使う文（design/04 §3.1）。
import { isOneOf, isRecord, isString } from '../validate'
import { DIRECTIONS, type GameIdeaBody } from './types'

const FIELD_MAX = 3_000
const TITLE_MAX = 200

export const REQUIRED_FIELDS = [
  'problem',
  'catch_copy',
  'concept',
  'scene',
  'screen',
  'player_actions',
  'goal',
  'core_loop',
  'core_choice',
  'fun_core',
  'keyword_mechanics'
] as const
export const OPTIONAL_FIELDS = ['features', 'challenges', 'prototype'] as const

/** 表示と Markdown の順。読む人がまず画面を思い浮かべられるよう、ねらいは後ろに置く（版 5） */
export const DISPLAY_FIELDS = [
  'catch_copy',
  'concept',
  'scene',
  'screen',
  'overview',
  'player_actions',
  'goal',
  'core_loop',
  'core_choice',
  'risk_return',
  'fun_core',
  'keyword_mechanics',
  'problem',
  'features',
  'challenges',
  'prototype'
] as const

export type DisplayField = (typeof DISPLAY_FIELDS)[number]

/** 項目の見出し（画面と Markdown で共通）。企画書やストアの紹介文で使う言葉にする（版 5） */
export const FIELD_LABELS: Record<DisplayField, string> = {
  catch_copy: 'キャッチコピー',
  concept: 'ひとことで',
  scene: 'プレイの一場面',
  screen: '画面',
  overview: 'どんなゲーム',
  player_actions: '操作',
  goal: '目的',
  core_loop: '遊びの流れ',
  core_choice: '悩みどころ',
  risk_return: '欲張ると',
  fun_core: '気持ちいい瞬間',
  keyword_mechanics: 'キーワードの使い方',
  problem: 'ねらい',
  features: '特徴的なシステム',
  challenges: '予想される課題',
  prototype: '試作のイメージ'
}

/** AI が返した 1 案を検査する。必須の項目が欠けていれば null。任意の項目の空文字は null にそろえる */
export function parseGameIdeaBody(v: unknown): GameIdeaBody | null {
  if (!isRecord(v) || !isOneOf(v['direction'], DIRECTIONS) || !isString(v['title'], TITLE_MAX, 1)) return null
  for (const f of REQUIRED_FIELDS) if (!isString(v[f], FIELD_MAX, 1)) return null
  const optional: Record<string, string | null> = {}
  for (const f of OPTIONAL_FIELDS) {
    const value = v[f]
    if (value === null || value === undefined || value === '') optional[f] = null
    else if (isString(value, FIELD_MAX)) optional[f] = value
    else return null
  }
  return {
    direction: v['direction'],
    title: (v['title'] as string).trim(),
    problem: v['problem'] as string,
    catch_copy: v['catch_copy'] as string,
    concept: v['concept'] as string,
    scene: v['scene'] as string,
    screen: v['screen'] as string,
    player_actions: v['player_actions'] as string,
    goal: v['goal'] as string,
    core_choice: v['core_choice'] as string,
    core_loop: v['core_loop'] as string,
    fun_core: v['fun_core'] as string,
    keyword_mechanics: v['keyword_mechanics'] as string,
    features: optional['features'] ?? null,
    challenges: optional['challenges'] ?? null,
    prototype: optional['prototype'] ?? null
  }
}

/** 検索用に全項目をつないだ文（ideas.body_text） */
export function bodyToText(body: GameIdeaBody): string {
  return [body.title, ...DISPLAY_FIELDS.map((f) => body[f] ?? '')]
    .filter((s) => s !== '')
    .join('\n')
}
