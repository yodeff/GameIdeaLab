// 生成の質の評価（design/04 §6、T-19）。開発時だけ `npm run eval:ideas` で動く。
// アプリでサインインした接続をそのまま使い、評価用の組み合わせを順に生成して private/eval/ に Markdown で書く。
// 結果は本物の履歴に混ぜないよう、メモリの DB に保存する。
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Combination } from '@core/draw'
import { formatCombination, ideaToMarkdown } from '@core/export'
import { PROMPT_VERSION, bodyToText, buildInstructions, type IdeaRecord } from '@core/idea'
import type { Settings } from '@core/settings'
import type { AiEvent } from '@shared/ipc'
import { DEFAULT_MODEL, type IdeaModelClient } from './ai/connection'
import { GenerationJobs } from './ai/jobs'
import { openDatabase } from './storage'

type EvalCase = Combination & { kind: string }

export async function runIdeaEvaluation(opts: {
  projectDir: string
  client: IdeaModelClient
  settings: Settings
  log: (line: string) => void
}): Promise<string> {
  const fixture = JSON.parse(readFileSync(join(opts.projectDir, 'tests/fixtures/eval-combinations.json'), 'utf8')) as {
    combinations: EvalCase[]
  }
  const db = openDatabase(':memory:')
  const settings = { ...opts.settings, aiCount: 3 }
  const model = settings.aiModel ?? DEFAULT_MODEL
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const lines = [
    `# 生成の質の評価 ${stamp}`,
    '',
    `- モデル: ${model}`,
    `- 忠実度: ${settings.aiFidelity}`,
    `- 接続: ${settings.aiConnection}`,
    `- 指示文の版: ${PROMPT_VERSION}`,
    '',
    '<!-- METRICS -->',
    '',
    '## 指示文',
    '',
    '```text',
    buildInstructions(settings.aiFidelity),
    '```',
    ''
  ]

  const all: IdeaRecord[] = []
  for (const [i, c] of fixture.combinations.entries()) {
    const label = `${i + 1}/${fixture.combinations.length} ${formatCombination(c)}（${c.kind}）`
    opts.log(`評価: ${label}`)
    const ideas: IdeaRecord[] = []
    let axes: (string | null)[] = []
    const started = Date.now()
    const outcome = await new Promise<AiEvent>((resolve) => {
      const jobs = new GenerationJobs({
        db,
        settings: () => settings,
        client: () => opts.client,
        emit: (e) => {
          if (e.type === 'started') axes = e.axes
          if (e.type === 'idea') ideas.push(e.idea)
          if (e.type === 'done' || e.type === 'error') resolve(e)
        },
        newId: randomUUID,
        now: () => new Date()
      })
      jobs.generate({ combination: { keyword1: c.keyword1, keyword2: c.keyword2, genre: c.genre }, count: 3, fidelity: settings.aiFidelity })
    })
    const seconds = Math.round((Date.now() - started) / 1000)
    all.push(...ideas)
    lines.push(`## ${i + 1}. ${formatCombination(c)}（${c.kind}）`, '')
    lines.push(
      outcome.type === 'error'
        ? `- 結果: 失敗（${outcome.error.kind}${outcome.error.detail ? `: ${outcome.error.detail}` : ''}）、届いた案 ${ideas.length}、${seconds} 秒`
        : `- 結果: ${ideas.length} 案（捨てた案 ${outcome.type === 'done' ? outcome.skipped : 0}）、${seconds} 秒`,
      ''
    )
    const usedAxes = axes.filter((a): a is string => a !== null)
    if (usedAxes.length > 0) lines.push(`- 実験的の変える軸: ${usedAxes.join(' / ')}`, '')
    for (const idea of ideas) {
      lines.push(`### [${idea.direction}] ${idea.title}`, '', ideaToMarkdown(idea).split('\n').slice(4).join('\n').trim(), '')
    }
    lines.push(
      '### 評価のメモ（人が書く）',
      '',
      '- キーワードがルールに入っているか:',
      '- 方向が分かれているか:',
      '- ありがちな型に寄っていないか:',
      '- 操作が具体的か / 30 秒で読めるか:',
      ''
    )
  }

  const text = lines.join('\n').replace('<!-- METRICS -->', metrics(all).join('\n'))
  const dir = join(opts.projectDir, 'private/eval')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${stamp}.md`)
  writeFileSync(file, text)
  db.close()
  return file
}

/** 回ごとに比べるための機械的な数値（LEARNINGS L-14・L-15） */
export function metrics(ideas: readonly IdeaRecord[]): string[] {
  const rows = ['王道', '変化球', '実験的'].map((direction) => {
    const list = ideas.filter((i) => i.direction === direction && i.body)
    const avg = (f: (i: IdeaRecord) => number) => (list.length ? Math.round(list.reduce((a, i) => a + f(i), 0) / list.length) : 0)
    const count = (re: RegExp) => list.filter((i) => re.test(i.body ? bodyToText(i.body) : '')).length
    const optional = list.reduce((n, i) => n + [i.body?.features, i.body?.challenges, i.body?.prototype].filter(Boolean).length, 0)
    return `| ${direction} | ${list.length} | ${avg((i) => (i.body ? bodyToText(i.body).length : 0))} | ${avg((i) => i.concept.length)} | ${list.filter((i) => i.concept.length > 40).length} | ${count(/ではなく|代わりに/)} | ${count(/そのもの/)} | ${count(/できないか|られないか/)} | ${optional} | ${count(/ほどけ|ほどく|解き放|溶けて|緊張がたま|駆け引きが生まれ/)} | ${count(/リスク|リターン|コアループ|メカニクス|ゲーム性/)} |`
  })
  return [
    '## 機械的な数値',
    '',
    '| 方向 | 案 | 平均字数 | コンセプトの平均字数 | コンセプト 40 字超 | 「ではなく・代わりに」 | 「そのもの」 | 「できないか」 | 任意の項目の数 | 比喩（ほどける・解き放つなど）を含む案 | 企画の用語を含む案 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows
  ]
}
