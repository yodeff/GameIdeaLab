import type { Combination } from '../draw'

/** 組み合わせの 1 行（D-8）。ジャンルが先。例: 経営シミュレーション × 自動販売機 × 寄生。ジャンルが無ければ「ジャンル自由」 */
export function formatCombination(combination: Combination): string {
  const words = [...combination.genres, ...combination.keywords].join(' × ')
  return combination.genres.length > 0 ? words : `${words}（ジャンル自由）`
}

/** 見出しなどで使う、種類ごとの 1 行 */
export const formatGenres = (c: Combination) => (c.genres.length > 0 ? c.genres.join(' / ') : '自由')
export const formatKeywords = (c: Combination) => c.keywords.join(' / ')
