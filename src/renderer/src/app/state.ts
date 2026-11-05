// 画面全体の状態（design/02 §4）。reducer は純粋に保ち、抽選は外で src/core/draw を呼んで結果を渡す。
import type { DrawState } from '@core/draw'
import type { Settings } from '@core/settings'
import type { Draft, Mode, Workspace } from '@core/workspace'

export type Screen = 'main' | 'saved' | 'settings'

export type AppState =
  | { status: 'loading' }
  | {
      status: 'ready'
      workspace: Workspace
      settings: Settings
      screen: Screen
      /** スロット（ID）ごとの抽選の回数。変わったら演出を始める */
      rolls: Record<string, number>
      toast: { id: number; message: string } | null
    }

export type ReadyState = Extract<AppState, { status: 'ready' }>

export type Action =
  | { type: 'loaded'; workspace: Workspace; settings: Settings }
  | { type: 'drew'; draw: DrawState; rolled: string[] }
  | { type: 'drawChanged'; draw: DrawState }
  | { type: 'modeChanged'; mode: Mode }
  | { type: 'draftChanged'; draft: Draft }
  | { type: 'screenChanged'; screen: Screen }
  | { type: 'settingsChanged'; settings: Settings }
  | { type: 'toast'; message: string }
  | { type: 'toastClosed'; id: number }

export function reducer(state: AppState, action: Action): AppState {
  if (action.type === 'loaded') {
    return {
      status: 'ready',
      workspace: action.workspace,
      settings: action.settings,
      screen: 'main',
      rolls: {},
      toast: null
    }
  }
  if (state.status !== 'ready') return state

  switch (action.type) {
    case 'drew': {
      const rolls = { ...state.rolls }
      for (const id of action.rolled) rolls[id] = (rolls[id] ?? 0) + 1
      return { ...state, workspace: { ...state.workspace, draw: action.draw }, rolls }
    }
    case 'drawChanged':
      return { ...state, workspace: { ...state.workspace, draw: action.draw } }
    case 'modeChanged':
      return { ...state, workspace: { ...state.workspace, mode: action.mode } }
    case 'draftChanged':
      return { ...state, workspace: { ...state.workspace, draft: action.draft } }
    case 'screenChanged':
      return { ...state, screen: action.screen }
    case 'settingsChanged':
      return { ...state, settings: action.settings }
    case 'toast':
      return { ...state, toast: { id: (state.toast?.id ?? 0) + 1, message: action.message } }
    case 'toastClosed':
      return state.toast?.id === action.id ? { ...state, toast: null } : state
  }
}
