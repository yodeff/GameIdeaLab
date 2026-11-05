import type { GameIdeaBody } from '@core/idea'

/** テスト用の AI の案 */
export const sampleIdea = (overrides: Partial<GameIdeaBody> = {}): GameIdeaBody => ({
  direction: '王道',
  title: '寄生自販機チェーン',
  problem: '経営シミュレーションは店を増やすだけの作業になりやすい。',
  concept: '建物から養分を吸う自販機を経営する。',
  overview: '概要。',
  player_actions: '設置と価格を決める。',
  goal: '売上目標の達成。',
  core_choice: '吸い上げを強めるか、建物を休ませるか。',
  risk_return: '吸い上げるほど原価は下がるが、建物が傷んで客が減る。',
  core_loop: '出店して調整する。',
  fun_core: '短期と長期の利益の見極め。',
  keyword_mechanics: '寄生が原価と建物の体力に効く。',
  features: null,
  challenges: null,
  prototype: null,
  ...overrides
})
