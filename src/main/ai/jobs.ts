// 生成のジョブ（design/02 §5、T-15）。同時に 1 つだけ。届いた案は 1 つずつ検査して履歴に保存してから送る。
// 2026-11-05: N 案を 1 回の依頼で作ると長くかかり、途中で切れると案が欠けた（メンテナー「10 案で依頼したのに 8 案」）。
// 1 案ずつ別の依頼にして最大 4 つ並べて走らせ、失敗した枠は 1 回だけやり直す（LEARNINGS L-19）。
import type { DatabaseSync } from 'node:sqlite'
import { aiErrorInfo, type AiErrorKind } from '@core/aiError'
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
  /** 案ごとの依頼（1 依頼 = 1 案） */
  inputs: string[]
  /** 実験的の案に割り当てた軸（派生では空） */
  axes: (string | null)[]
  parentId?: string
  derivation?: string
}

/** 同時に走らせる依頼の数 */
export const MAX_PARALLEL = 4
/** 1 つの枠のやり直しの回数 */
const RETRY_PER_SLOT = 1
/** やり直してよい誤り（一時的なもの）。それ以外はすべての枠を止める */
const RETRIABLE = new Set<AiErrorKind>(['incomplete', 'invalid-output', 'temporarily-unavailable', 'network'])

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
      inputs: plan.map((slot, i) => buildGenerateInput(request.combination, [slot], { index: i, total: request.count })),
      axes: plan.map((p) => p.axis)
    })
  }

  /** 派生（Q-5）。元は書き換えず、新しい案を 1 つ作る */
  derive(request: DeriveRequest): string {
    const parent = getIdea(this.deps.db, request.parentId)
    if (!parent?.body) throw new AiError('config-error', '派生の元になる AI の案が見つからない')
    const combination = request.operation === 'genre' && request.genre ? { ...parent.combination, genres: [request.genre] } : parent.combination
    const extra = {
      ...(request.genre ? { genre: request.genre } : {}),
      ...(request.instruction ? { instruction: request.instruction } : {})
    }
    const label = request.operation === 'free' ? `自由: ${request.instruction ?? ''}` : DERIVE_LABELS[request.operation]
    return this.start({
      combination,
      total: 1,
      fidelity: parent.fidelity ?? this.deps.settings().aiFidelity,
      inputs: [buildDeriveInput(parent.combination, parent.body, request.operation, extra)],
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
    const settings = deps.settings()
    const model = settings.aiModel ?? DEFAULT_MODEL
    deps.emit({
      jobId,
      type: 'started',
      total: plan.total,
      combination: plan.combination,
      parentId: plan.parentId ?? null,
      axes: plan.axes
    })
    const base = {
      model,
      instructions: buildInstructions(plan.fidelity),
      textFormat: IDEAS_TEXT_FORMAT,
      ...(settings.aiReasoning !== 'default' ? { reasoningEffort: settings.aiReasoning } : {})
    }
    // 1 つの枠が続けられない誤り（利用量の上限・認証など）で、ほかの枠も止めるための中止
    const inner = new AbortController()
    const stopAll = () => inner.abort()
    signal.addEventListener('abort', stopAll)

    let received = 0
    let failed = 0
    let fatal: AiError | null = null
    let lastError: AiError | null = null

    /** 1 つの枠を作る。届いた最初の読める案を保存して送る */
    const runSlot = async (input: string): Promise<void> => {
      const parser = createIdeaStreamParser()
      for await (const delta of deps.client().stream({ ...base, input } satisfies ModelRequest, inner.signal)) {
        for (const item of parser.push(delta)) {
          const body = item instanceof Error ? null : parseGameIdeaBody(item)
          if (!body) continue // 壊れた案は捨てる（design/04 §3.5）
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
          return // 1 依頼 = 1 案。余分な案は使わない
        }
      }
      throw new AiError('invalid-output', '読める案が届かなかった')
    }

    const attempt = async (input: string): Promise<void> => {
      for (let tryNo = 0; tryNo <= RETRY_PER_SLOT; tryNo++) {
        if (fatal || inner.signal.aborted) return
        try {
          await runSlot(input)
          return
        } catch (e) {
          const error = e instanceof AiError ? e : new AiError('config-error', e instanceof Error ? e.message : String(e))
          if (error.kind === 'cancelled' && (fatal || signal.aborted)) return
          if (!RETRIABLE.has(error.kind)) {
            fatal ??= error
            stopAll()
            return
          }
          lastError = error
        }
      }
      failed++
    }

    // 最大 MAX_PARALLEL 本を並べて走らせる
    const queue = [...plan.inputs]
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
      for (let input = queue.shift(); input !== undefined; input = queue.shift()) await attempt(input)
    })

    // 終わりを知らせる前に実行中の印を外す。知らせを受けた画面がすぐ次を始めても busy にならないように
    const finish = (event: AiEvent) => {
      if (this.running?.id === jobId) this.running = null
      deps.emit(event)
    }
    try {
      await Promise.all(workers)
      if (signal.aborted) throw new AiError('cancelled')
      if (fatal) throw fatal
      if (received === 0) throw lastError ?? new AiError('invalid-output', '読める案が届かなかった')
      finish({ jobId, type: 'done', received, skipped: failed })
    } catch (e) {
      const error = e instanceof AiError ? e.info() : aiErrorInfo('config-error', e instanceof Error ? e.message : String(e))
      finish({ jobId, type: 'error', error, received })
    } finally {
      signal.removeEventListener('abort', stopAll)
      if (this.running?.id === jobId) this.running = null
      try {
        pruneHistory(deps.db)
      } catch (e) {
        console.error('履歴を整理できなかった', e)
      }
    }
  }
}
