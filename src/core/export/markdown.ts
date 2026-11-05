// Markdown の出力（企画書 §10、design/04 §5.2）。そのまま外部の AI に貼れる形。説明や前置きを付けない
import { FIELD_LABELS, OPTIONAL_FIELDS, type IdeaRecord } from '../idea'

const section = (heading: string, text: string | null | undefined): string[] =>
  text && text.trim() !== '' ? [`## ${heading}`, text.trim(), ''] : []

export function ideaToMarkdown(idea: IdeaRecord): string {
  const c = idea.combination
  const lines = [`# ${idea.title}`, '', `- キーワード: ${c.keyword1} / ${c.keyword2}`, `- ジャンル: ${c.genre}`, '']
  const body = idea.body
  if (body) {
    lines.push(
      ...section(FIELD_LABELS.problem, body.problem),
      ...section(FIELD_LABELS.concept, body.concept),
      ...section(FIELD_LABELS.overview, body.overview),
      ...section(FIELD_LABELS.player_actions, body.player_actions),
      ...section(FIELD_LABELS.goal, body.goal),
      ...section(FIELD_LABELS.core_choice, body.core_choice),
      ...section(FIELD_LABELS.risk_return, body.risk_return),
      ...section(FIELD_LABELS.core_loop, body.core_loop),
      ...section(FIELD_LABELS.fun_core, body.fun_core),
      ...OPTIONAL_FIELDS.flatMap((f) => section(FIELD_LABELS[f], body[f])),
      ...section(FIELD_LABELS.keyword_mechanics, body.keyword_mechanics)
    )
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
