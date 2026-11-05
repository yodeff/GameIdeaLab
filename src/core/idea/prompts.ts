// 指示文の組み立て（design/04 §3.2〜3.4）。生成の質を変えるのはここ。変えたら評価の手順（§6）で見比べる。
// 版 2（2026-11-05）: ゲーム性を「リスクとリターンの駆け引き」、面白さを「緊張をためて解き放つ流れ」として書かせる。
// 版 3（2026-11-05）: コンセプトを「課題 → 解き方」で立てさせ、面白さの核を一句にまとめさせる。
// 版 4（2026-11-05）: 実験的の「変える軸」はアプリが乱数で割り当てる（例を挙げるとモデルが例に寄るため。L-16）。
//   任意の項目は 1 つだけ、「課題」の言い回しを散らす。
// 考え方は YouTube「桜井政博のゲーム作るには」のまとめ動画（A: 仕事の姿勢、B: ゲーム性、C: 企画・ゲーム設計、
// N: 企画コンセプト）を自分たちの言葉で要約したもの（LEARNINGS L-15・L-16）。動画の言葉は写していない。
import type { Combination } from '../draw'
import { pickIndex, type Rng } from '../random'
import type { Fidelity } from '../settings'
import { DIRECTIONS, type Direction, type GameIdeaBody } from './types'

export const PROMPT_VERSION = 4

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
  strict: '2 つのキーワードの両方を、ゲームのメカニクス（ルール・操作・資源・勝ち負けの条件）の中心に組み込む。',
  standard: '少なくとも片方のキーワードをゲームのメカニクスに組み込む。もう片方は設定や体験に使ってもよい。',
  free: 'キーワードから連想した概念へ飛躍してよい。ただし飛躍した先はゲームのメカニクスに組み込む。'
}

const DIRECTION_RULES: Record<Direction, string> = {
  王道: '分かりやすく遊びやすい。ジャンルの面白さの理由をまっすぐ生かし、ゲームとして成立していることを重視する。',
  変化球: 'ジャンルの定番の前提を 1 つ選んで根本から変える（なぜそのジャンルが面白いのかを考え、その仕組みを別の形で組み直す）。',
  実験的: 'これまであまり見られない遊びを試す。依頼で指定された「変える軸」を大きく変える。実現の難しさより新しさを優先してよい。'
}

const RULES = [
  'あなたはゲームデザイナーとして、2 つのキーワードとゲームジャンルから、遊びとして成立するゲームのアイデアを考える。',
  '好みで選ばず、与えられた組み合わせを解くべき課題として扱う。判断はすべて遊ぶ人の目線で行い、作り手の都合や市場の分析は書かない。',
  '',
  '## 考える手順（出力には書かない）',
  '1. 課題を決める: この組み合わせとジャンルで何が問題になるか、またはそのジャンルの定番のどこに不満があるか。',
  '2. 実現できるかを気にせず、解き方の候補をいくつも出す。',
  '3. 細くても面白そうな糸口を選んで掘り下げ、1 案に絞る。多数決で選ぶような無難な案は捨てる。',
  '',
  '## ゲーム性の考え方',
  '- ゲーム性はリスクとリターンの駆け引きとして考える。何を冒すほど何が得られるのかを決め、リスクとリターンを近い時間・近い場所に置く。危険が大きい瞬間ほど得るものも大きい形がよい。',
  '- 面白さは、緊張や不自由をためてから一気に解き放つ流れとして考える。「爽快」「奥深い」などの形容詞で済ませず、どこでたまり、どこで解き放たれるのかを書く。',
  '- コアループは「障害 → 解消 → 報酬 → 強化や進展」の順に書く。報酬は中身と使い道まで具体的に書く。',
  '- 有利になる仕組みには、相反する要素も入れる（速く進めるなら止まりやすくなる、など）。',
  '- プレイヤーが毎回迷う選択を 1 つ決める（深追いするか引き返すか、のような具体的な二択）。',
  '- 新しいルールは 1〜2 個に絞り、遊び始めて 3 分で伝わるようにする。知られた操作やルールは借りてよい。',
  '- 中心の仕組み 1 つで、課題と別の問題（初心者と上級者の両立、キャラクターらしさなど）を同時に解けるとよい。',
  '- 一方向に思い切り尖らせる。平均的にまとまった案にしない。',
  '- 作業・育成・クラフト・リズムなど、駆け引きが中心でないジャンルでは、「稼いで強くなる」流れや、なりきる楽しさ、操作の気持ちよさを核にしてよい。その場合も、一番近い緊張と見返りを「リスクとリターン」に書く。',
  '',
  '## キーワードの扱い',
  '- 組み合わせに意味的な関係が無くてもよい。関係の薄さを新しいルールのきっかけにする。キーワードを自然な語に置き換えたり、無難な案に寄せたりしない。',
  '- キーワードを名前や見た目の飾りにしない。ルール・操作・資源のどれかに変える。片方をリターンの側、もう片方をリスクや相反する要素の側に置くと噛み合いやすい。',
  '- キーワードから生まれる設定が、そのままルールや制約の理由になるようにする（その世界ではなぜそうなるのかが一言で言える）。',
  '',
  '## 書き方',
  '- 「課題」に立てた問いを 1 文で書き、「コンセプト」にはその解き方を、何をするゲームでどこがひねりかが分かる 1 文（40 字以内）で書く。課題は問いの形でも言い切りでもよく、案ごとに書き出しと語尾を変える（毎回「〜できないか」で終えない）。',
  '- 任意の 3 項目（特徴的なシステム・予想される課題・試作のイメージ）は、その案で一番伝えたいものを 1 つだけ書き、残りは null にする。',
  '- 「面白さの核」は「〜する楽しさ」の一句で始める。ほかの項目はすべてこの一句に向かうように書く。',
  '- 1 案は 1 案として言い切る。「〜など」「〜という手もある」でぼかさない。',
  '- 既存の作品名・キャラクター名を出さない。「〜のような」「〜風」で説明しない（元の作品を遊べば済む案にしない）。ありがちな RPG やホラーに安易に寄せない。',
  '- 同じ言い回しを案ごとに繰り返さない（「〜ではなく」「〜そのものが」などの決まった型に頼らない）。',
  '- 各項目は 1〜2 文。1 案を 30 秒で読める長さにする。日本語で書く。',
  '- 書き終えたら確かめる: コンセプトは課題を解いているか、全項目が面白さの核の一句に向かっているか、リスクとリターンは近いか、相反する要素はあるか、毎回の選択はあるか、既存の作品を遊べば済む案になっていないか。'
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

/** 生成の依頼（input）。A モードの下書きは入れない（D-12） */
export function buildGenerateInput(combination: Combination, plan: readonly PlannedIdea[]): string {
  return [
    `キーワード1: ${combination.keyword1}`,
    `キーワード2: ${combination.keyword2}`,
    `ゲームジャンル: ${combination.genre}`,
    '',
    `${plan.length} 案を出す。案ごとの方向は次のとおり。案同士をはっきり違うものにする。`,
    ...plan.map((p, i) => `${i + 1}. ${p.direction}${p.axis ? `（変える軸: ${p.axis}）` : ''}`)
  ].join('\n')
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
  original: '元の案の核を残しつつ、もっと独創的にする。ありがちな部分を見つけて、意外なルールや体験に置き換える。',
  gameplay:
    'ゲーム性を強める。リスクとリターンをもっと近づけ、毎回の選択で本当に迷うようにし、緊張がたまって解き放たれる流れをはっきりさせる。',
  simpler: 'ルールと要素を減らし、もっとシンプルにする。一番面白い駆け引きだけを残し、3 分で伝わるようにする。'
}

/** 派生の依頼（input）。previous_response_id が使えないので元の案を毎回入れる（調査 §4） */
export function buildDeriveInput(
  combination: Combination,
  parent: GameIdeaBody,
  operation: DeriveOperation,
  extra: { genre?: string; instruction?: string }
): string {
  const request =
    operation === 'genre'
      ? `ジャンルを「${extra.genre ?? combination.genre}」に変えて考え直す。キーワードの使い方は保つ。`
      : operation === 'free'
        ? `次の指示に従って変える: ${extra.instruction ?? ''}`
        : DERIVE_RULES[operation]
  return [
    `キーワード1: ${combination.keyword1}`,
    `キーワード2: ${combination.keyword2}`,
    `ゲームジャンル: ${operation === 'genre' ? (extra.genre ?? combination.genre) : combination.genre}`,
    '',
    '元の案:',
    JSON.stringify(parent, null, 2),
    '',
    `この案から派生した新しい案を 1 案出す。${request}`,
    `方向は元の案と同じ「${parent.direction}」にする。`
  ].join('\n')
}
