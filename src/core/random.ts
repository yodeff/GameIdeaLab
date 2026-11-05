// 乱数は外から渡す（design/04 §1.1、D-7）。テストでは固定の列を渡す。

/** [0, 1) の値を返す関数。本番は Math.random */
export type Rng = () => number

/** 0 以上 length 未満の整数を均等に選ぶ */
export function pickIndex(rng: Rng, length: number): number {
  if (length <= 0) throw new Error('pickIndex: length must be positive')
  return Math.min(length - 1, Math.floor(rng() * length))
}

/** 配列から 1 つを均等に選ぶ */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  const item = items[pickIndex(rng, items.length)]
  if (item === undefined) throw new Error('pickOne: empty array')
  return item
}
