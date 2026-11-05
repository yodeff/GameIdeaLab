// 生成のジョブ（design/02 §5、T-15）。同時に 1 つだけ。届いた案は 1 つずつ検査して履歴に保存してから送る。
import type { DatabaseSync } from 'node:sqlite'
import { aiErrorInfo } from '@core/aiError'
import type { Combination } from '@core/draw'
import {
  DERIVE_LABELS,
  IDEAS_TEXT_FORMAT,
  buildDeriveInput,
  buildGenerateInput,
  buildInstructions,
  createIdeaStreamParser,
  planIdeas,
  parseGameIdeaBody,
  type DeriveRequest,
  type GenerateRequest
} from '@core/idea'
import type { Fidelity, Settings } from '@core/settings'
import type { AiEvent } from '@shared/ipc'
import { getIdea, insertAiIdea, pruneHistory } from '../storage'
import { DEFAULT_MODEL, type IdeaModelClient } from './connection'
import { AiError } from './errors'
import type { ModelRequest } from './responses'

export type JobDeps = {
  db: DatabaseSync
  settings: () => Settings
  client: () => IdeaModelClient
  emit: (event: AiEvent) => void
  newId: () => string
  now: () => Date
  /** 実験的の軸の割り当てに使う。既定は Math.random */
  rng?: () => number
}

type Plan = {
  combination: Combination
  total: number
  fidelity: Fidelity
  input: string
  /** 実験的の案に割り当てた軸（派生では空） */
  axes: (string | null)[]
  parentId?: string
  derivation?: string
}

export class GenerationJobs {
  private running: { id: string; controller: AbortController } | null = null

  constructor(private readonly deps: JobDeps) {}

  isRunning(): boolean {
    return this.running !== null
  }

  /** 生成を始めて jobId を返す。結果は emit で届く */
  generate(request: GenerateRequest): string {
    const plan = planIdeas(request.count, this.deps.rng ?? Math.random)
    return this.start({
      combination: request.combination,
      total: request.count,
      fidelity: request.fidelity,
      input: buildGenerateInput(request.combination, plan),
      axes: plan.map((p) => p.axis)
    })
  }

  /** 派生（Q-5）。元は書き換えず、新しい案を 1 つ作る */
  derive(request: DeriveRequest): string {
    const parent = getIdea(this.deps.db, request.parentId)
    if (!parent?.body) throw new AiError('config-error', '派生の元になる AI の案が見つからない')
    const combination = request.operation === 'genre' && request.genre ? { ...parent.combination, genre: request.genre } : parent.combination
    const extra = {
      ...(request.genre ? { genre: request.genre } : {}),
      ...(request.instruction ? { instruction: request.instruction } : {})
    }
    const label = request.operation === 'free' ? `自由: ${request.instruction ?? ''}` : DERIVE_LABELS[request.operation]
    return this.start({
      combination,
      total: 1,
      fidelity: parent.fidelity ?? this.deps.settings().aiFidelity,
      input: buildDeriveInput(parent.combination, parent.body, request.operation, extra),
      axes: [],
      parentId: parent.id,
      derivation: label
    })
  }

  cancel(jobId: string): void {
    if (this.running?.id === jobId) this.running.controller.abort()
  }

  private start(plan: Plan): string {
    if (this.running) throw new AiError('busy')
    const id = this.deps.newId()
    const controller = new AbortController()
    this.running = { id, controller }
    void this.run(id, plan, controller.signal)
    return id
  }

  private async run(jobId: string, plan: Plan, signal: AbortSignal): Promise<void> {
    const { deps } = this
    const model = deps.settings().aiModel ?? DEFAULT_MODEL
    deps.emit({
      jobId,
      type: 'started',
      total: plan.total,
      combination: plan.combination,
      parentId: plan.parentId ?? null,
      axes: plan.axes
    })
    const request: ModelRequest = {
      model,
      instructions: buildInstructions(plan.fidelity),
      input: plan.input,
      textFormat: IDEAS_TEXT_FORMAT
    }
    const parser = createIdeaStreamParser()
    let received = 0
    let skipped = 0
    // 終わりを知らせる前に実行中の印を外す。知らせを受けた画面がすぐ次を始めても busy にならないように
    const finish = (event: AiEvent) => {
      if (this.running?.id === jobId) this.running = null
      deps.emit(event)
    }
    try {
      for await (const delta of deps.client().stream(request, signal)) {
        for (const item of parser.push(delta)) {
          const body = item instanceof Error ? null : parseGameIdeaBody(item)
          if (!body) {
            skipped++ // 壊れた案だけを捨て、全体は止めない（design/04 §3.5）
            continue
          }
          const idea = insertAiIdea(
            deps.db,
            {
              body,
              combination: plan.combination,
              generationId: jobId,
              model,
              fidelity: plan.fidelity,
              ...(plan.parentId ? { parentId: plan.parentId } : {}),
              ...(plan.derivation ? { derivation: plan.derivation } : {})
            },
            deps.newId(),
            deps.now().toISOString()
          )
          deps.emit({ jobId, type: 'idea', index: received, idea })
          received++
        }
      }
      if (received === 0) throw new AiError('invalid-output', `skipped ${skipped}`)
      finish({ jobId, type: 'done', received, skipped })
    } catch (e) {
      const error = e instanceof AiError ? e.info() : aiErrorInfo('config-error', e instanceof Error ? e.message : String(e))
      finish({ jobId, type: 'error', error, received })
    } finally {
      if (this.running?.id === jobId) this.running = null
      try {
        pruneHistory(deps.db)
      } catch (e) {
        console.error('履歴を整理できなかった', e)
      }
    }
  }
}
