// ブラウザで画面だけを開いたときの、偽の AI（開発用）。URL に ?mock-ai を付けたときだけ使う。
// ?mock-ai=usage-limit のように誤りの区別を付けると、その誤りで終わる。本物の AI には繋がない。
import { AI_ERROR_KINDS, aiErrorInfo, type AiErrorKind } from '@core/aiError'
import type { Combination } from '@core/draw'
import { DERIVE_LABELS, directionsFor, type GameIdeaBody, type IdeaRecord } from '@core/idea'
import type { AiEvent, AuthStatus, GameIdeaLabApi } from '@shared/ipc'
import { addIdea } from './browserIdeas'

type AiApi = Pick<
  GameIdeaLabApi,
  | 'getAuthStatus'
  | 'signIn'
  | 'cancelSignIn'
  | 'signOut'
  | 'setApiKey'
  | 'clearApiKey'
  | 'listModels'
  | 'generate'
  | 'derive'
  | 'cancelGeneration'
  | 'onAiEvent'
  | 'openExternal'
>

const mockParam = new URLSearchParams(location.search).get('mock-ai')
export const mockAiEnabled = mockParam !== null
const failWith = AI_ERROR_KINDS.find((k) => k === mockParam) as AiErrorKind | undefined

function sample(direction: GameIdeaBody['direction'], c: Combination, n: number): GameIdeaBody {
  const [k1 = '', k2 = k1] = c.keywords
  const genre = c.genres.join('×') || 'ゲーム'
  return {
    direction,
    title: `${k1}と${k2}の${direction}案 ${n}`,
    problem: `${genre}で${k1}を扱うと、置くだけの作業になりやすい。`,
    catch_copy: `${k1}で${k2}を制せ。`,
    concept: `${k1}が${k2}を通じて資源になる${genre}。`,
    scene: `画面の左に${k1}が 5 つ並ぶ。プレイヤーが 1 つを右へ動かすと、${k2}のゲージが 3 目盛り伸びる。`,
    screen: '（偽の AI の出力です）真上から見た盤面。左に手札、右に得点のゲージが見える。',
    player_actions: '配置する・交換する・待つ、の 3 つから毎ターン 1 つを選ぶ。',
    goal: '30 ターン以内に目標の数値に届かせる。',
    core_choice: '今すぐ交換して確実に得るか、待って倍にするか。',
    core_loop: '状況を読む → 行動を選ぶ → 結果で次の選択肢が変わる。',
    fun_core: '短期の得と長期の得のどちらを取るかの判断。',
    keyword_mechanics: `${k1}が量、${k2}が速さを決める。`,
    features: n % 2 === 0 ? '盤面の端から状況が変わる。' : null,
    challenges: null,
    prototype: null
  }
}

export function createMockAi(): AiApi {
  const listeners = new Set<(e: AiEvent) => void>()
  const emit = (e: AiEvent) => listeners.forEach((l) => l(e))
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>()
  let status: AuthStatus = {
    chatgpt: { signedIn: false, account: null, planUsage: false },
    apiKey: { configured: false, last4: null },
    encryptionAvailable: true
  }
  let ideas: IdeaRecord[] = []
  let running: string | null = null

  const run = (combination: Combination, directions: GameIdeaBody['direction'][], extra: { parentId?: string; derivation?: string }) => {
    if (running) return { ok: false as const, error: aiErrorInfo('busy') }
    const jobId = crypto.randomUUID()
    running = jobId
    emit({ jobId, type: 'started', total: directions.length, combination, parentId: extra.parentId ?? null, axes: directions.map(() => null) })
    const list: ReturnType<typeof setTimeout>[] = []
    directions.forEach((d, i) => {
      list.push(
        setTimeout(() => {
          if (failWith && i === 1) return
          const body = sample(d, combination, i + 1)
          const now = new Date().toISOString()
          const idea: IdeaRecord = {
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            source: 'ai',
            saved: false,
            favorite: false,
            title: body.title,
            concept: body.concept,
            combination,
            bodyText: [body.title, body.concept, body.scene].join(' '),
            body,
            direction: d,
            memo: '',
            parentId: extra.parentId ?? null,
            derivation: extra.derivation ?? null,
            generationId: jobId,
            model: 'mock',
            fidelity: 'standard',
            drawContext: null
          }
          ideas.push(idea)
          addIdea(idea)
          emit({ jobId, type: 'idea', index: i, idea })
        }, 900 * (i + 1))
      )
    })
    list.push(
      setTimeout(() => {
        running = null
        if (failWith) emit({ jobId, type: 'error', error: aiErrorInfo(failWith, 'mock'), received: 1 })
        else emit({ jobId, type: 'done', received: directions.length, skipped: 0 })
      }, 900 * directions.length + 200)
    )
    timers.set(jobId, list)
    return { ok: true as const, value: jobId }
  }

  return {
    getAuthStatus: async () => status,
    signIn: async () => {
      await new Promise((r) => setTimeout(r, 600))
      status = { ...status, chatgpt: { signedIn: true, account: { name: 'Mock Player', email: 'mock@example.com' }, planUsage: true } }
      return { ok: true, value: status }
    },
    cancelSignIn: async () => {},
    signOut: async () => {
      status = { ...status, chatgpt: { signedIn: false, account: null, planUsage: false } }
      return { revoked: true, status }
    },
    setApiKey: async (key) => {
      status = { ...status, apiKey: { configured: true, last4: key.slice(-4) } }
      return { ok: true, value: status }
    },
    clearApiKey: async () => {
      status = { ...status, apiKey: { configured: false, last4: null } }
      return status
    },
    listModels: async () => ({
      ok: true,
      value: [
        { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', description: 'Latest workhorse model.', reasoningLevels: ['low', 'medium', 'high'], defaultReasoning: 'low' },
        { id: 'gpt-6-luna', label: 'GPT-6-Luna', description: 'Small and fast.', reasoningLevels: ['low', 'medium'], defaultReasoning: 'low' }
      ]
    }),
    generate: async (req) => run(req.combination, directionsFor(req.count), {}),
    derive: async (req) => {
      const parent = ideas.find((i) => i.id === req.parentId)
      if (!parent?.body) return { ok: false, error: aiErrorInfo('config-error', 'parent') }
      const combination = req.genre ? { ...parent.combination, genres: [req.genre] } : parent.combination
      return run(combination, [parent.body.direction], { parentId: parent.id, derivation: DERIVE_LABELS[req.operation] })
    },
    cancelGeneration: async (jobId) => {
      timers.get(jobId)?.forEach(clearTimeout)
      if (running === jobId) {
        running = null
        emit({ jobId, type: 'error', error: aiErrorInfo('cancelled'), received: 0 })
      }
    },
    onAiEvent: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener')
    }
  }
}

/** 偽の AI を使わないときの、ブラウザでの AI（使えない） */
export function createUnavailableAi(): AiApi {
  const status: AuthStatus = {
    chatgpt: { signedIn: false, account: null, planUsage: false },
    apiKey: { configured: false, last4: null },
    encryptionAvailable: false
  }
  const unavailable = { ok: false as const, error: aiErrorInfo('config-error', 'ブラウザでは AI を使えません（デスクトップ版で使えます）') }
  return {
    getAuthStatus: async () => status,
    signIn: async () => unavailable,
    cancelSignIn: async () => {},
    signOut: async () => ({ revoked: true, status }),
    setApiKey: async () => unavailable,
    clearApiKey: async () => status,
    listModels: async () => unavailable,
    generate: async () => unavailable,
    derive: async () => unavailable,
    cancelGeneration: async () => {},
    onAiEvent: () => () => {},
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener')
    }
  }
}
