// 指示文の組み立て（design/04 §3.2〜3.4）。生成の質を変えるのはここ。変えたら評価の手順（§6）で見比べる。
// 版 2（2026-11-05）: ゲーム性をリスクとリターンの駆け引き、面白さを我慢の後に報われる流れとして考えさせる。
// 版 3（2026-11-05）: 案を「ねらい（課題）→ 解き方」で立てさせる。
// 版 4（2026-11-05）: 実験的の「変える軸」はアプリが乱数で割り当てる（例を挙げるとモデルが例に寄るため。L-16）。
// 版 5（2026-11-05）: 書き方を、ゲームの企画書やストアの紹介文のように、遊んだことのない人がプレイの様子を
//   思い浮かべられる形に変える。キャッチコピーとプレイの一場面を足し、企画の用語と比喩を本文から外す（L-18）。
// 考え方は YouTube「桜井政博のゲーム作るには」のまとめ動画（A・B・C・N）を自分たちの言葉で要約したもの
// （LEARNINGS L-15・L-16）。動画の言葉は写していない。
import type { Combination } from '../draw'
import { pickIndex, type Rng } from '../random'
import type { Fidelity } from '../settings'
import { DIRECTIONS, type Direction, type GameIdeaBody } from './types'

export const PROMPT_VERSION = 5

/** 王道 → 変化球 → 実験的 の順に繰り返す（D-13） */
export function directionsFor(count: number): Direction[] {
  return Array.from({ length: count }, (_, i) => DIRECTIONS[i % DIRECTIONS.length] as Direction)
}

/** 実験的の案で変える軸。アプリが 1 つずつ割り当てる（版 4） */
export const EXPERIMENT_AXES = [
  '入力の方法（ボタンの数、押す・離す、タイミングなど）',
  '視点やカメラ',
  '時間の流れ（止まる、戻る、現実の時間と結びつくなど）',
  '勝ち負けの条件',
  '人数や役割（協力、非対称、見ている人など）',
  '情報の見え方（隠れている、後から分かるなど）',
  '空間の形（狭い、つながる、変形するなど）',
  'プレイヤーが操作する対象',
  '報酬や得点の意味',
  'ゲームの外（画面の外、現実の物、ほかの遊びとのつながり）'
] as const

export type PlannedIdea = { direction: Direction; axis: string | null }

/** 方向を並べ、実験的の案に軸を割り当てる。同じ依頼の中では軸を重ねない */
export function planIdeas(count: number, rng: Rng): PlannedIdea[] {
  let pool: string[] = [...EXPERIMENT_AXES]
  return directionsFor(count).map((direction) => {
    if (direction !== '実験的') return { direction, axis: null }
    if (pool.length === 0) pool = [...EXPERIMENT_AXES]
    const [axis] = pool.splice(pickIndex(rng, pool.length), 1)
    return { direction, axis: axis ?? null }
  })
}

const FIDELITY_RULES: Record<Fidelity, string> = {
  strict: 'すべてのキーワードを、ルール・操作・持ち物・勝ち負けの条件の中心に入れる。',
  standard: '少なくとも 1 つのキーワードをルールや操作に入れる。残りは舞台や見た目に使ってもよい。',
  free: 'キーワードから連想したものへ飛躍してよい。ただし飛躍した先をルールや操作に入れる。'
}

const DIRECTION_RULES: Record<Direction, string> = {
  王道: '分かりやすく遊びやすい。ジャンルの面白さをまっすぐ生かし、ゲームとして成り立つことを大事にする。',
  変化球: 'ジャンルのお決まりを 1 つ選んで根本から変える。そのジャンルがなぜ面白いのかを考え、同じ面白さを別のやり方で作る。',
  実験的: 'これまであまり見られない遊びを試す。依頼で指定された「変える軸」を大きく変える。作りやすさより新しさを優先してよい。'
}

const RULES = [
  'あなたはゲームデザイナーとして、いくつかのキーワードとゲームジャンルから、遊びとして成り立つゲームのアイデアを考え、1 枚の企画書のように書く。',
  '好みで選ばず、与えられた組み合わせを解くべき課題として扱う。判断はすべて遊ぶ人の目線で行い、作り手の都合や市場の分析は書かない。',
  '',
  '## 考える手順（出力には書かない）',
  '1. ねらいを決める: この組み合わせとジャンルで何が難しいか、またはそのジャンルのお決まりのどこを変えたいか。',
  '2. 作れるかどうかを気にせず、解き方の候補をいくつも出す。',
  '3. 細くても面白そうな糸口を選んで掘り下げ、1 案に絞る。多数決で選ぶような無難な案は捨てる。',
  '',
  '## 面白さの考え方',
  '- 欲張るほど大きく得られ、同時に失う危険も大きくなる選択を作る。得るものと失うものは、同じ場面・同じ瞬間に置く。',
  '- 遊ぶ人が我慢したり迷ったりした後に、はっきり報われる瞬間を作る。',
  '- 遊びの流れは「困ったことが起きる → 手を打つ → ごほうびを得る → 強くなる・先へ進む」の順に考える。ごほうびは中身と使い道まで決める。',
  '- 有利になる仕組みには、それと引き換えの不利も入れる（速く進めるなら止まりにくい、など）。',
  '- 新しいルールは 1〜2 個に絞り、遊び始めて 3 分で分かるようにする。知られた操作やルールは借りてよい。',
  '- 一方向に思い切り尖らせる。平均的にまとまった案にしない。',
  '- 作業・育成・クラフト・リズムなど駆け引きが中心でないジャンルでは、稼いで強くなる流れや、なりきる楽しさ、操作の気持ちよさを中心にしてよい。',
  '',
  '## キーワードの扱い',
  '- 組み合わせに意味のつながりが無くてもよい。つながりの薄さを新しいルールのきっかけにする。キーワードを自然な語に置き換えたり、無難な案に寄せたりしない。',
  '- キーワードを名前や見た目の飾りにしない。ルール・操作・持ち物のどれかに変える。',
  '- キーワードから生まれる設定が、そのままルールの理由になるようにする（その世界ではなぜそうなるのかを一言で言える）。',
  '',
  '## 書き方（遊んだことのない人が、プレイの様子を思い浮かべられるように）',
  '- 日本語で、ゲームのストアの紹介文や 1 枚の企画書のように書く。読む人は企画の専門家ではない。',
  '- 画面に映る物を名詞で書き、プレイヤーの手の動き（押す、離す、なぞる、長押しする）と、その結果を 1 文でつなぐ。',
  '- 数とタイミングを入れる（「3 秒」「5 体」「7 拍目」「残り 10 秒」）。数字は半角で書く。具体的な物・色・音も入れる。',
  '- 状態の違いは対にして書く（「昼は〜できる。夜は〜できない」）。',
  '- 作った名前（技・道具・場所など）を出したら、すぐ後に何かを説明する。',
  '- 1 文に 1 つのことを書く。1 文はおよそ 40 字、長くても 60 字。誰が何をしてどうなるかが分かるように、主語（プレイヤー、敵、客など）を書く。',
  '- 比喩や抽象的な言い方で済ませない。「ほどける」「解き放たれる」「溶けていく」「緊張がたまる」「駆け引きが生まれる」「〜を味わえる」のような言い方を使わず、画面やルールで実際に起きることを書く。',
  '- 「リスク」「リターン」「メカニクス」「コアループ」「ゲーム性」などの企画の用語を本文に使わない。',
  '- 体言止めを続けない。絵文字・記号の飾り・括弧での言い換えを使わない。',
  '- 1 案は 1 案として言い切る。「〜など」「〜という手もある」でぼかさない。',
  '- 既存の作品名・キャラクター名を出さない。「〜のような」「〜風」で説明しない。ありがちな RPG やホラーに安易に寄せない。',
  '- 案ごとに書き出しと語尾を変え、同じ言い回しを繰り返さない。',
  '- 任意の 3 項目（特徴的なシステム・予想される課題・試作のイメージ）は、その案で一番伝えたいものを 1 つだけ書き、残りは null にする。',
  '- 書き終えたら確かめる: プレイの一場面を読んで画面が思い浮かぶか、悩みどころで本当に迷うか、得るものと失うものが同じ場面にあるか、既存の作品を遊べば済む案になっていないか。'
]

/** 生成の developer の指示（instructions） */
export function buildInstructions(fidelity: Fidelity): string {
  return [
    ...RULES,
    `- キーワードの使い方: ${FIDELITY_RULES[fidelity]}`,
    '',
    '## 方向の意味',
    ...DIRECTIONS.map((d) => `- ${d}: ${DIRECTION_RULES[d]}`)
  ].join('\n')
}

/** 依頼の冒頭の、キーワードとジャンルの行。ジャンルが複数なら掛け合わせ、無ければ自由に選ばせる */
export function combinationLines(combination: Combination): string[] {
  const genre =
    combination.genres.length === 0
      ? 'ゲームジャンル: 指定なし（キーワードに合うジャンルを自由に選び、「ひとことで」に書く）'
      : combination.genres.length === 1
        ? `ゲームジャンル: ${combination.genres[0]}`
        : `ゲームジャンル: ${combination.genres.join(' と ')}（これらを掛け合わせる）`
  return [...combination.keywords.map((k, i) => `キーワード${i + 1}: ${k}`), genre]
}

/**
 * 生成の依頼（input）。A モードの下書きは入れない（D-12）。
 * 1 依頼で 1 案を作り、同じ組み合わせのほかの案は別の依頼で並べて作る（jobs.ts）。of は全体の中の位置
 */
export function buildGenerateInput(
  combination: Combination,
  plan: readonly PlannedIdea[],
  of?: { index: number; total: number }
): string {
  const lines = [...combinationLines(combination), '']
  if (plan.length === 1 && plan[0]) {
    const p = plan[0]
    if (of && of.total > 1) lines.push(`この組み合わせから ${of.total} 案を別々に作る。これは ${of.index + 1} 案目で、ほかの案は別の方向で作られる。`)
    lines.push(`1 案を出す。方向は「${p.direction}」。${p.axis ? `変える軸は「${p.axis}」。` : ''}`)
    return lines.join('\n')
  }
  lines.push(
    `${plan.length} 案を出す。案ごとの方向は次のとおり。案同士をはっきり違うものにする。`,
    ...plan.map((p, i) => `${i + 1}. ${p.direction}${p.axis ? `（変える軸: ${p.axis}）` : ''}`)
  )
  return lines.join('\n')
}

export type DeriveOperation = 'original' | 'gameplay' | 'simpler' | 'genre' | 'free'

export const DERIVE_LABELS: Record<DeriveOperation, string> = {
  original: 'もっと独創的に',
  gameplay: 'ゲーム性を強く',
  simpler: 'もっとシンプルに',
  genre: '別のジャンルで',
  free: '自由に指示…'
}

export const DERIVE_INSTRUCTION_MAX = 500

const DERIVE_RULES: Record<Exclude<DeriveOperation, 'genre' | 'free'>, string> = {
  original: '元の案の中心を残しつつ、もっと独創的にする。ありがちな部分を見つけて、意外なルールや遊び方に置き換える。',
  gameplay:
    '遊びとしての手応えを強める。欲張ったときに得るものと失うものをもっと近づけ、毎回の選択で本当に迷うようにし、我慢の後に報われる瞬間をはっきりさせる。',
  simpler: 'ルールと要素を減らし、もっとシンプルにする。一番面白い選択だけを残し、3 分で分かるようにする。'
}

/** 派生の依頼（input）。previous_response_id が使えないので元の案を毎回入れる（調査 §4） */
export function buildDeriveInput(
  combination: Combination,
  parent: GameIdeaBody,
  operation: DeriveOperation,
  extra: { genre?: string; instruction?: string }
): string {
  const target = operation === 'genre' && extra.genre ? { ...combination, genres: [extra.genre] } : combination
  const request =
    operation === 'genre'
      ? `ジャンルを「${extra.genre ?? combination.genres.join('・')}」に変えて考え直す。キーワードの使い方は保つ。`
      : operation === 'free'
        ? `次の指示に従って変える: ${extra.instruction ?? ''}`
        : DERIVE_RULES[operation]
  return [
    ...combinationLines(target),
    '',
    '元の案:',
    JSON.stringify(parent, null, 2),
    '',
    `この案から派生した新しい案を 1 案出す。${request}`,
    `方向は元の案と同じ「${parent.direction}」にする。`
  ].join('\n')
}
