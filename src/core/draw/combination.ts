// 組み合わせの検査（IPC の入力・保存データの読み込み）。古い形（keyword1・keyword2・genre）も読める
import { isRecord, isString } from '../validate'
import { MANUAL_MAX_LENGTH, SLOT_LIMITS, type Combination } from './draw'

const isWordList = (v: unknown, min: number, max: number): v is string[] =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every((w) => isString(w, MANUAL_MAX_LENGTH, 1))

/** 組み合わせを読む。数の範囲（ジャンル 0〜3・キーワード 1〜5）と語の長さを確かめる。不正なら null */
export function parseCombination(v: unknown): Combination | null {
  if (!isRecord(v)) return null
  if ('keyword1' in v) {
    // 2026-11-05 より前の形（キーワード 2 つ・ジャンル 1 つ）
    const { keyword1, keyword2, genre } = v
    if (!isString(keyword1, MANUAL_MAX_LENGTH) || !isString(keyword2, MANUAL_MAX_LENGTH) || !isString(genre, MANUAL_MAX_LENGTH)) return null
    const keywords = [keyword1, keyword2].filter((w) => w !== '')
    return keywords.length > 0 ? { genres: genre ? [genre] : [], keywords } : null
  }
  const { genres, keywords } = v
  if (!isWordList(genres, SLOT_LIMITS.genre.min, SLOT_LIMITS.genre.max)) return null
  if (!isWordList(keywords, SLOT_LIMITS.keyword.min, SLOT_LIMITS.keyword.max)) return null
  return { genres: [...genres], keywords: [...keywords] }
}
