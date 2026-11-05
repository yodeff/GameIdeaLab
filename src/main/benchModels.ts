// モデルごとの速さを計る（開発用。`npm run bench:models`）。アプリでサインインした接続を使い、
// 同じ組み合わせで 1 案ずつ生成して、案が届くまでの秒数を private/eval/ に書く。結果は本物の履歴に混ぜない
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AiReasoning, Settings } from '@core/settings'
import type { AiEvent } from '@shared/ipc'
import type { IdeaModelClient } from './ai/connection'
import { GenerationJobs } from './ai/jobs'
import { openDatabase } from './storage'

const COMBINATION = { genres: ['経営シミュレーション'], keywords: ['自動販売機', '寄生'] }

export async function runModelBench(opts: {
  projectDir: string
  client: IdeaModelClient
  settings: Settings
  log: (line: string) => void
}): Promise<string> {
  const models = await opts.client.listModels()
  const db = openDatabase(':memory:')
  const rows: string[] = []
  const cases: { model: string; label: string; reasoning: AiReasoning }[] = models.flatMap((m) => [
    { model: m.id, label: m.label, reasoning: 'default' as const },
    ...(m.reasoningLevels.includes('low') && m.defaultReasoning !== 'low' ? [{ model: m.id, label: m.label, reasoning: 'low' as const }] : [])
  ])

  for (const c of cases) {
    opts.log(`計測: ${c.label}（${c.reasoning}）`)
    const settings: Settings = { ...opts.settings, aiModel: c.model, aiReasoning: c.reasoning, aiCount: 1 }
    const started = Date.now()
    let firstIdea: number | null = null
    let title = ''
    const outcome = await new Promise<AiEvent>((resolve) => {
      const jobs = new GenerationJobs({
        db,
        settings: () => settings,
        client: () => opts.client,
        emit: (e) => {
          if (e.type === 'idea' && firstIdea === null) {
            firstIdea = Date.now() - started
            title = e.idea.title
          }
          if (e.type === 'done' || e.type === 'error') resolve(e)
        },
        newId: randomUUID,
        now: () => new Date()
      })
      jobs.generate({ combination: COMBINATION, count: 1, fidelity: settings.aiFidelity })
    })
    const total = Math.round((Date.now() - started) / 100) / 10
    const first = firstIdea === null ? '—' : String(Math.round(firstIdea / 100) / 10)
    const result = outcome.type === 'error' ? `失敗（${outcome.error.kind}${outcome.error.detail ? `: ${outcome.error.detail}` : ''}）` : `成功: ${title}`
    rows.push(`| ${c.label} | ${c.reasoning} | ${first} | ${total} | ${result} |`)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(opts.projectDir, 'private/eval')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `bench-${stamp}.md`)
  writeFileSync(
    file,
    [
      `# モデルごとの速さ ${stamp}`,
      '',
      `- 組み合わせ: ${COMBINATION.genres.join(' × ')} × ${COMBINATION.keywords.join(' × ')}、1 案、忠実度 ${opts.settings.aiFidelity}`,
      '- 1 回ずつの計測。混み具合でぶれる',
      '',
      '| モデル | 考える深さ | 案が届くまで（秒） | 全体（秒） | 結果 |',
      '|---|---|---|---|---|',
      ...rows,
      ''
    ].join('\n')
  )
  db.close()
  return file
}
