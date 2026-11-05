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
    'problem',
    'title',
    'catch_copy',
    'concept',
    'scene',
    'screen',
    'player_actions',
    'goal',
    'core_loop',
    'core_choice',
    'fun_core',
    'keyword_mechanics',
    'features',
    'challenges',
    'prototype'
  ],
  properties: {
    direction: { type: 'string', enum: [...DIRECTIONS], description: '割り当てられた方向' },
    problem: text('ねらい。誰がどんな場面で遊ぶゲームか、そのジャンルのお決まりのどこを変えるか（1〜2 文）'),
    title: text('ゲームタイトル（仮）。遊びの動詞か、中心になる物を入れた短い句'),
    catch_copy: text('キャッチコピー。役割と目的を命令形で言うか、意外性のある一言（15 字前後）'),
    concept: text('ひとことで。「〈物〉を〈操作〉して〈目的〉を果たす〈ジャンル〉」の形の 1 文（40 字以内）'),
    scene: text('プレイの一場面。「あなた」を主語に現在形で、画面の物・手の動き・数字を入れて 2〜3 文'),
    screen: text('画面。視点（横から、真上から、一人称など）と、何がどこに見えるかを 1〜2 文'),
    player_actions: text('操作。「〜すると〜する」の形で、入力と結果を対にして 2〜3 個'),
    goal: text('目的。勝ちやクリアの条件を数字を入れて'),
    core_loop: text('遊びの流れ。動詞 3〜4 個をつないだ 1 文と、1 周にかかるおよその時間'),
    core_choice: text('悩みどころ。「A を取れば X が増えるが、Y を失う」の形の具体的な 2 択'),
    fun_core: text('気持ちいい瞬間。何をした瞬間に、画面で何が起きるか。感情の言葉は最後に 1 つまで'),
    keyword_mechanics: text('キーワードの使い方。2 つのキーワードが、それぞれどのルールや操作になっているか'),
    features: optionalText('特徴的なシステム（無ければ null）'),
    challenges: optionalText('予想される課題（無ければ null）'),
    prototype: optionalText('試作のイメージ。まず作って確かめる場面と、どこを磨けば化けるか（無ければ null）')
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
