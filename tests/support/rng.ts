import type { Rng } from '@core/random'

/** 種から決まる乱数（mulberry32）。多数回の抽選の偏りを確かめるテストで使う */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 決まった値を順に返す（尽きたら最初から） */
export function sequenceRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}
