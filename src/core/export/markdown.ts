// Markdown の出力（企画書 §10、design/04 §5.2）。そのまま外部の AI に貼れる形。説明や前置きを付けない
import { DISPLAY_FIELDS, FIELD_LABELS, type IdeaRecord } from '../idea'
import { formatGenres, formatKeywords } from './combination'

const section = (heading: string, text: string | null | undefined): string[] =>
  text && text.trim() !== '' ? [`## ${heading}`, text.trim(), ''] : []

export function ideaToMarkdown(idea: IdeaRecord): string {
  const c = idea.combination
  const lines = [`# ${idea.title}`, '', `- ジャンル: ${formatGenres(c)}`, `- キーワード: ${formatKeywords(c)}`, '']
  const body = idea.body
  if (body) {
    lines.push(...DISPLAY_FIELDS.flatMap((f) => section(FIELD_LABELS[f], body[f])))
  } else {
    lines.push(...section('内容', idea.bodyText))
  }
  lines.push(...section('メモ', idea.memo))
  return lines.join('\n').trimEnd() + '\n'
}

/** 複数の案は --- でつなぐ */
export function ideasToMarkdown(ideas: readonly IdeaRecord[]): string {
  return ideas.map(ideaToMarkdown).join('\n---\n\n')
}
