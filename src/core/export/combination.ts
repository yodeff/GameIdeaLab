import type { Combination } from '../draw'

/** 組み合わせの 1 行（D-8）。例: 自動販売機 × 寄生 × 経営シミュレーション */
export function formatCombination(combination: Combination): string {
  return [combination.keyword1, combination.keyword2, combination.genre].join(' × ')
}
