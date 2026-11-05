// B モードの状態（接続・生成中のジョブ・結果）。結果は main から 1 案ずつ届く（design/02 §5）
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { aiErrorInfo, type AiErrorInfo } from '@core/aiError'
import { combinationOf, type Combination } from '@core/draw'
import type { DeriveOperation, IdeaRecord } from '@core/idea'
import type { AiEvent, AuthStatus, ModelOption } from '@shared/ipc'
import { api } from '../api'
import { sounds } from '../sound/player'
import { useActions, useAppState } from './AppContext'

export const MANAGE_USAGE_URL = 'https://chatgpt.com/settings/usage'

type Job = { id: string; combination: Combination; total: number; received: number; parentId: string | null; startedAt: number }

type AiState = {
  auth: AuthStatus | null
  signingIn: boolean
  job: Job | null
  /** 直前の生成の結果と、その派生 */
  results: IdeaRecord[]
  resultCombination: Combination | null
  resultAt: string | null
  /** 新しい生成を始める前の結果。1 案も届かずに終わったら戻す */
  previous: Pick<AiState, 'results' | 'resultCombination' | 'resultAt'> | null
  error: AiErrorInfo | null
  /** 頼んだ数より少なく終わったときの知らせ */
  shortfall: { requested: number; received: number } | null
  models: ModelOption[] | null
  modelsError: AiErrorInfo | null
  planNoticeOpen: boolean
}

type Action =
  | { type: 'auth'; auth: AuthStatus }
  | { type: 'signingIn'; value: boolean }
  | { type: 'event'; event: AiEvent }
  | { type: 'error'; error: AiErrorInfo | null }
  | { type: 'models'; models: ModelOption[] | null; error: AiErrorInfo | null }
  | { type: 'planNotice'; open: boolean }
  | { type: 'restored'; ideas: IdeaRecord[] }
  | { type: 'ideaChanged'; idea: IdeaRecord }
  | { type: 'ideaRemoved'; id: string }

const initial: AiState = {
  auth: null,
  signingIn: false,
  job: null,
  results: [],
  resultCombination: null,
  resultAt: null,
  previous: null,
  error: null,
  shortfall: null,
  models: null,
  modelsError: null,
  planNoticeOpen: false
}

/** 派生案は元の案（とその派生）の後ろに入れる */
function insertResult(results: IdeaRecord[], idea: IdeaRecord): IdeaRecord[] {
  if (!idea.parentId) return [...results, idea]
  let at = results.findIndex((r) => r.id === idea.parentId)
  if (at < 0) return [...results, idea]
  while (results[at + 1]?.parentId === idea.parentId) at++
  return [...results.slice(0, at + 1), idea, ...results.slice(at + 1)]
}

function reducer(state: AiState, action: Action): AiState {
  switch (action.type) {
    case 'auth':
      return { ...state, auth: action.auth }
    case 'signingIn':
      return { ...state, signingIn: action.value }
    case 'error':
      return { ...state, error: action.error }
    case 'models':
      return { ...state, models: action.models, modelsError: action.error }
    case 'planNotice':
      return { ...state, planNoticeOpen: action.open }
    case 'restored': {
      // 起動時に前回の生成を戻す（design/04 §2）。すでに生成が始まっていれば何もしない
      if (state.job || state.results.length > 0 || action.ideas.length === 0) return state
      const first = action.ideas[0]
      return {
        ...state,
        results: action.ideas.reduce<IdeaRecord[]>(insertResult, []),
        resultCombination: first ? first.combination : null,
        resultAt: first ? first.createdAt : null
      }
    }
    case 'ideaChanged':
      return { ...state, results: state.results.map((r) => (r.id === action.idea.id ? action.idea : r)) }
    case 'ideaRemoved':
      return { ...state, results: state.results.filter((r) => r.id !== action.id) }
    case 'event': {
      const e = action.event
      if (e.type === 'started') {
        const job: Job = { id: e.jobId, combination: e.combination, total: e.total, received: 0, parentId: e.parentId, startedAt: Date.now() }
        // 新しい生成なら前の結果を入れ替える。派生なら足す
        return e.parentId
          ? { ...state, job, error: null, shortfall: null }
          : {
              ...state,
              job,
              error: null,
              shortfall: null,
              previous: { results: state.results, resultCombination: state.resultCombination, resultAt: state.resultAt },
              results: [],
              resultCombination: e.combination,
              resultAt: new Date().toISOString()
            }
      }
      if (state.job?.id !== e.jobId) return state
      if (e.type === 'idea') {
        return { ...state, job: { ...state.job, received: state.job.received + 1 }, results: insertResult(state.results, e.idea) }
      }
      if (e.type === 'done') {
        const short = e.received < state.job.total ? { requested: state.job.total, received: e.received } : null
        return { ...state, job: null, previous: null, shortfall: short }
      }
      // 1 案も届かずに終わったら、直前の結果を表示し続ける
      const restore = e.received === 0 && state.results.length === 0 && state.previous ? state.previous : {}
      return { ...state, ...restore, job: null, previous: null, error: e.error }
    }
  }
}

type AiActions = {
  refreshAuth: () => Promise<void>
  signIn: () => Promise<void>
  cancelSignIn: () => void
  signOut: () => Promise<void>
  setApiKey: (key: string) => Promise<boolean>
  clearApiKey: () => Promise<void>
  loadModels: () => Promise<void>
  generate: () => Promise<void>
  derive: (parent: IdeaRecord, operation: DeriveOperation, extra?: { genre?: string; instruction?: string }) => Promise<void>
  cancel: () => void
  dismissError: () => void
  closePlanNotice: () => void
  openManageUsage: () => void
  /** 保存済み画面などで案が変わったとき、B モードの結果にも反映する */
  ideaChanged: (idea: IdeaRecord) => void
  ideaRemoved: (id: string) => void
}

const StateCtx = createContext<AiState | null>(null)
const ActionsCtx = createContext<AiActions | null>(null)

export function isConnected(auth: AuthStatus | null, connection: 'chatgpt' | 'apiKey'): boolean {
  if (!auth) return false
  return connection === 'chatgpt' ? auth.chatgpt.signedIn : auth.apiKey.configured
}

export function AiProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const app = useAppState()
  const appActions = useActions()
  const { settings } = app
  const combination = combinationOf(app.workspace.draw)

  useEffect(
    () =>
      api.onAiEvent((event) => {
        dispatch({ type: 'event', event })
        // 案が出そろったら鳴らす（1 案も届かなかったとき・中止・誤りでは鳴らさない）
        if (event.type === 'done' && event.received > 0) sounds.complete()
      }),
    []
  )
  useEffect(() => {
    void api.getAuthStatus().then((auth) => dispatch({ type: 'auth', auth }))
    void api.latestGeneration().then((ideas) => dispatch({ type: 'restored', ideas }))
  }, [])

  const refreshAuth = useCallback(async () => dispatch({ type: 'auth', auth: await api.getAuthStatus() }), [])

  const startJob = useCallback(
    async (start: () => ReturnType<typeof api.generate>) => {
      const result = await start()
      if (result.ok) return
      if (result.error.kind === 'busy' && state.job && window.confirm('生成中の案を中止して、新しく生成しますか？')) {
        await api.cancelGeneration(state.job.id)
        const retry = await start()
        if (!retry.ok) dispatch({ type: 'error', error: retry.error })
        return
      }
      dispatch({ type: 'error', error: result.error })
    },
    [state.job]
  )

  const actions = useMemo<AiActions>(
    () => ({
      refreshAuth,
      signIn: async () => {
        dispatch({ type: 'signingIn', value: true })
        try {
          const result = await api.signIn()
          if (result.ok) {
            dispatch({ type: 'auth', auth: result.value })
            dispatch({ type: 'error', error: null })
            if (result.value.chatgpt.planUsage && !settings.planNoticeShown) dispatch({ type: 'planNotice', open: true })
          } else if (result.error.kind !== 'cancelled') {
            appActions.toast(`サインインできませんでした（${result.error.detail ?? result.error.message}）`)
          }
        } finally {
          dispatch({ type: 'signingIn', value: false })
        }
      },
      cancelSignIn: () => void api.cancelSignIn(),
      signOut: async () => {
        if (!window.confirm('ChatGPT からサインアウトしますか？')) return
        const { revoked, status } = await api.signOut()
        dispatch({ type: 'auth', auth: status })
        appActions.toast(
          revoked ? 'サインアウトしました' : 'サインアウトしました。接続の解除を確かめられなかったので、ChatGPT の設定から解除できます'
        )
      },
      setApiKey: async (key) => {
        const result = await api.setApiKey(key)
        if (result.ok) dispatch({ type: 'auth', auth: result.value })
        else appActions.toast('API キーを保存できませんでした。形を確かめてください')
        return result.ok
      },
      clearApiKey: async () => {
        if (!window.confirm('保存した API キーを消しますか？')) return
        dispatch({ type: 'auth', auth: await api.clearApiKey() })
      },
      loadModels: async () => {
        const result = await api.listModels()
        dispatch(result.ok ? { type: 'models', models: result.value, error: null } : { type: 'models', models: null, error: result.error })
      },
      generate: async () => {
        if (!isConnected(state.auth, settings.aiConnection)) {
          dispatch({ type: 'error', error: aiErrorInfo('not-signed-in') })
          return
        }
        await startJob(() => api.generate({ combination, count: settings.aiCount, fidelity: settings.aiFidelity }))
      },
      derive: async (parent, operation, extra = {}) => {
        await startJob(() => api.derive({ parentId: parent.id, operation, ...extra }))
      },
      cancel: () => {
        if (state.job) void api.cancelGeneration(state.job.id)
      },
      dismissError: () => dispatch({ type: 'error', error: null }),
      closePlanNotice: () => {
        dispatch({ type: 'planNotice', open: false })
        void appActions.updateSettings({ planNoticeShown: true })
      },
      openManageUsage: () => void api.openExternal(MANAGE_USAGE_URL),
      ideaChanged: (idea) => dispatch({ type: 'ideaChanged', idea }),
      ideaRemoved: (id) => dispatch({ type: 'ideaRemoved', id })
    }),
    [refreshAuth, startJob, state.auth, state.job, settings, combination, appActions]
  )

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
    </StateCtx.Provider>
  )
}

export function useAi(): AiState {
  const s = useContext(StateCtx)
  if (!s) throw new Error('AiProvider の外で使われた')
  return s
}

export function useAiActions(): AiActions {
  const a = useContext(ActionsCtx)
  if (!a) throw new Error('AiProvider の外で使われた')
  return a
}
