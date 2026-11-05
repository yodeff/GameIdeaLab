// 保存済み・履歴の一覧の条件と、案の更新の入力（design/03 §3、design/04 §4、T-20）。
import { MANUAL_MAX_LENGTH } from '../draw'
import { isInt, isOneOf, isRecord, isString } from '../validate'
import { bodyToText } from './body'
import { IDEA_TITLE_MAX, type IdeaRecord } from './types'

export type IdeaScope = 'saved' | 'history'

export type IdeaListQuery = {
  scope: IdeaScope
  /** 部分一致（D-18）。空なら絞らない */
  text: string
  genre: string | null
  favoritesOnly: boolean
  limit: number
}

export type IdeaListResult = {
  ideas: IdeaRecord[]
  /** 条件に合う件数（limit の前） */
  total: number
  /** その範囲（保存済み・履歴）にあるジャンル。絞り込みの選択肢 */
  genres: string[]
}

export type IdeaPatch = { saved?: boolean; favorite?: boolean; memo?: string; title?: string }

export const MEMO_MAX = 10_000
export const LIST_LIMIT_MAX = 500
const SEARCH_MAX = 100

export function parseIdeaListQuery(v: unknown): IdeaListQuery | null {
  if (!isRecord(v) || !isOneOf(v['scope'], ['saved', 'history'] as const)) return null
  if (!isString(v['text'], SEARCH_MAX) || typeof v['favoritesOnly'] !== 'boolean') return null
  if (!(v['genre'] === null || isString(v['genre'], MANUAL_MAX_LENGTH, 1))) return null
  if (!isInt(v['limit'], 1, LIST_LIMIT_MAX)) return null
  return { scope: v['scope'], text: v['text'].trim(), genre: v['genre'], favoritesOnly: v['favoritesOnly'], limit: v['limit'] }
}

export function parseIdeaPatch(v: unknown): IdeaPatch | null {
  if (!isRecord(v)) return null
  const patch: IdeaPatch = {}
  for (const [key, value] of Object.entries(v)) {
    if (key === 'saved' || key === 'favorite') {
      if (typeof value !== 'boolean') return null
      patch[key] = value
    } else if (key === 'memo') {
      if (!isString(value, MEMO_MAX)) return null
      patch.memo = value
    } else if (key === 'title') {
      if (!isString(value, IDEA_TITLE_MAX) || value.trim() === '') return null
      patch.title = value.trim()
    } else {
      return null
    }
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * 更新の規則（design/04 §4）: お気に入りにしたら保存済みにする（履歴の整理で消えないように）。
 * 履歴に戻したらお気に入りを外す。
 */
export function applyIdeaPatch(idea: IdeaRecord, patch: IdeaPatch, now: string): IdeaRecord {
  const next: IdeaRecord = { ...idea, ...patch, updatedAt: now }
  if (patch.favorite === true) next.saved = true
  if (patch.saved === false) next.favorite = false
  return next
}

/** 検索の対象の文（タイトル・キーワード・ジャンル・本文・メモ） */
export function searchableText(idea: IdeaRecord): string {
  const c = idea.combination
  return [idea.title, c.keyword1, c.keyword2, c.genre, idea.body ? bodyToText(idea.body) : idea.bodyText, idea.memo].join('\n')
}

/** 一覧の条件に合うか（ブラウザの代わりの保存で使う。SQLite では同じ条件を SQL で書く） */
export function matchesQuery(idea: IdeaRecord, q: IdeaListQuery): boolean {
  if (idea.saved !== (q.scope === 'saved')) return false
  if (q.favoritesOnly && !idea.favorite) return false
  if (q.genre !== null && idea.combination.genre !== q.genre) return false
  return q.text === '' || searchableText(idea).toLowerCase().includes(q.text.toLowerCase())
}
