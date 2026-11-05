import type { GameIdeaBody } from '@core/idea'

/** テスト用の AI の案 */
export const sampleIdea = (overrides: Partial<GameIdeaBody> = {}): GameIdeaBody => ({
  direction: '王道',
  title: '寄生自販機チェーン',
  problem: '経営シミュレーションは店を増やすだけの作業になりやすい。',
  catch_copy: '吸うほど売れる、吸いすぎると潰れる。',
  scene: '画面には 3 台の自販機と古いビルが並ぶ。プレイヤーがつまみを右へ回すと、売上の数字が速く増え、ビルの窓が 1 つずつ暗くなる。',
  concept: '建物から養分を吸う自販機を経営する。',
  screen: '真上から見た商店街。画面の下に自販機が 3 台、上に古いビルが並ぶ。',
  player_actions: '設置と価格を決める。',
  goal: '売上目標の達成。',
  core_choice: '吸い上げを強めるか、建物を休ませるか。',
  core_loop: '出店して調整する。',
  fun_core: '短期と長期の利益の見極め。',
  keyword_mechanics: '寄生が原価と建物の体力に効く。',
  features: null,
  challenges: null,
  prototype: null,
  ...overrides
})
