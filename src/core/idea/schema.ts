// AI に返させる JSON の形（design/04 §3.1、DECISIONS/0003 §5）。text.format の json_schema（strict）に渡す。
// strict は全項目の列挙を求めるので、任意の項目も required に入れて null を許す。
import { DIRECTIONS } from './types'

const text = (description: string) => ({ type: 'string', description })
const optionalText = (description: string) => ({ type: ['string', 'null'], description })

export const IDEA_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'direction',
    'title',
    'problem',
    'concept',
    'overview',
    'player_actions',
    'goal',
    'core_choice',
    'risk_return',
    'core_loop',
    'fun_core',
    'keyword_mechanics',
    'features',
    'challenges',
    'prototype'
  ],
  properties: {
    direction: { type: 'string', enum: [...DIRECTIONS], description: '割り当てられた方向' },
    title: text('ゲームタイトル（仮）'),
    problem: text('課題。この組み合わせとジャンルで立てた問い、またはジャンルの定番への不満（1 文）'),
    concept: text('一言コンセプト。課題の解き方で、何をするゲームでどこがひねりかが分かる 1 文（40 字以内）'),
    overview: text('ゲームの概要（1〜2 文）'),
    player_actions: text('プレイヤーが行う操作'),
    goal: text('ゲームの目的'),
    core_choice: text('プレイヤーが毎回迷う選択（具体的な二択など）'),
    risk_return: text('リスクとリターン。何を冒すほど何が得られるか'),
    core_loop: text('コアループ。障害 → 解消 → 報酬 → 強化や進展 の順に'),
    fun_core: text('面白さの核。「〜する楽しさ」の一句で始め、どこで緊張がたまり、どこで解き放たれるかを続ける'),
    keyword_mechanics: text('2 つのキーワードがルールやゲーム性にどう関わるか'),
    features: optionalText('特徴的なシステム（無ければ null）'),
    challenges: optionalText('予想される課題（無ければ null）'),
    prototype: optionalText('試作のイメージ。まず作って確かめる瞬間と、どの手触りを磨けば化けるか（無ければ null）')
  }
} as const

export const IDEAS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: { ideas: { type: 'array', items: IDEA_ITEM_SCHEMA } }
} as const

/** Responses API の text.format に渡す値 */
export const IDEAS_TEXT_FORMAT = {
  type: 'json_schema',
  name: 'game_ideas',
  schema: IDEAS_SCHEMA,
  strict: true
} as const
