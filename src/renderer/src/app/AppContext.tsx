import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import {
  addSlot,
  combinationOf,
  drawAll,
  drawSlot,
  initialDrawState,
  removeSlot,
  setCategories,
  setLocked,
  setManualValue,
  type SlotKind
} from '@core/draw'
import { formatCombination } from '@core/export'
import type { Settings } from '@core/settings'
import { emptyDraft, type Draft, type Mode, type Workspace } from '@core/workspace'
import { api } from '../api'
import { dictionaries } from './dictionaries'
import { reducer, type AppState, type ReadyState, type Screen } from './state'

const AUTOSAVE_DELAY_MS = 500
const rng = Math.random

type Actions = {
  drawAll: () => void
  drawSlot: (id: string) => void
  toggleLock: (id: string) => void
  setManual: (id: string, value: string) => void
  setCategories: (id: string, categoryIds: string[]) => void
  addSlot: (kind: SlotKind) => void
  removeSlot: (id: string) => void
  copyCombination: () => void
  setMode: (mode: Mode) => void
  setDraft: (draft: Draft) => void
  setScreen: (screen: Screen) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  toast: (message: string) => void
  closeToast: (id: number) => void
}

const StateContext = createContext<ReadyState | null>(null)
const ActionsContext = createContext<Actions | null>(null)

function freshWorkspace(): Workspace {
  return { version: 2, mode: 'human', draw: initialDrawState(dictionaries, rng), draft: emptyDraft(new Date().toISOString()) }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading' } as AppState)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    void Promise.all([api.loadWorkspace(), api.getSettings(), api.getAppInfo()]).then(([workspace, settings, info]) => {
      dispatch({ type: 'loaded', workspace: workspace ?? freshWorkspace(), settings })
      if (info.notice) dispatch({ type: 'toast', message: info.notice })
    })
  }, [])

  // 作業状態の自動保存（D-9）。最後の変更から 500 ms 後にまとめて送る
  const workspace = state.status === 'ready' ? state.workspace : null
  useEffect(() => {
    if (!workspace) return
    const timer = setTimeout(() => {
      api.saveWorkspace(workspace).catch((e: unknown) => console.error('作業状態を保存できなかった', e))
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [workspace])

  // 閉じる直前にも送る
  useEffect(() => {
    const flush = () => {
      const s = stateRef.current
      if (s.status === 'ready') void api.saveWorkspace(s.workspace)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  const withDraw = useCallback(<T,>(fn: (s: ReadyState) => T): T | undefined => {
    const s = stateRef.current
    return s.status === 'ready' ? fn(s) : undefined
  }, [])

  const actions = useMemo<Actions>(
    () => ({
      drawAll: () =>
        withDraw((s) => {
          const rolled = s.workspace.draw.slots.filter((slot) => !slot.locked).map((slot) => slot.id)
          dispatch({ type: 'drew', draw: drawAll(s.workspace.draw, dictionaries, rng), rolled })
        }),
      drawSlot: (id) => withDraw((s) => dispatch({ type: 'drew', draw: drawSlot(s.workspace.draw, id, dictionaries, rng), rolled: [id] })),
      toggleLock: (id) =>
        withDraw((s) => {
          const slot = s.workspace.draw.slots.find((x) => x.id === id)
          if (slot) dispatch({ type: 'drawChanged', draw: setLocked(s.workspace.draw, id, !slot.locked) })
        }),
      setManual: (id, value) => withDraw((s) => dispatch({ type: 'drawChanged', draw: setManualValue(s.workspace.draw, id, value) })),
      setCategories: (id, ids) => withDraw((s) => dispatch({ type: 'drawChanged', draw: setCategories(s.workspace.draw, id, ids) })),
      addSlot: (kind) =>
        withDraw((s) => {
          const draw = addSlot(s.workspace.draw, kind, dictionaries, rng)
          const added = draw.slots.find((x) => !s.workspace.draw.slots.some((y) => y.id === x.id))
          dispatch({ type: 'drew', draw, rolled: added ? [added.id] : [] })
        }),
      removeSlot: (id) => withDraw((s) => dispatch({ type: 'drawChanged', draw: removeSlot(s.workspace.draw, id) })),
      copyCombination: () =>
        withDraw((s) => {
          const text = formatCombination(combinationOf(s.workspace.draw))
          navigator.clipboard.writeText(text).then(
            () => dispatch({ type: 'toast', message: `コピーしました: ${text}` }),
            () => dispatch({ type: 'toast', message: 'コピーできませんでした' })
          )
        }),
      setMode: (mode) => dispatch({ type: 'modeChanged', mode }),
      setDraft: (draft) => dispatch({ type: 'draftChanged', draft }),
      setScreen: (screen) => dispatch({ type: 'screenChanged', screen }),
      updateSettings: async (patch) => {
        const settings = await api.updateSettings(patch)
        dispatch({ type: 'settingsChanged', settings })
      },
      toast: (message) => dispatch({ type: 'toast', message }),
      closeToast: (id) => dispatch({ type: 'toastClosed', id })
    }),
    [withDraw]
  )

  if (state.status !== 'ready') return <div className="loading">読み込み中…</div>
  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState(): ReadyState {
  const s = useContext(StateContext)
  if (!s) throw new Error('AppProvider の外で使われた')
  return s
}

export function useActions(): Actions {
  const a = useContext(ActionsContext)
  if (!a) throw new Error('AppProvider の外で使われた')
  return a
}
