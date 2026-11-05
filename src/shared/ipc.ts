// main・preload・renderer が共有する IPC の契約（design/02 §3）。
// renderer へ公開する機能はここに型として列挙し、preload はこの型どおりにだけ橋渡しする。
import type { AiErrorInfo } from '@core/aiError'
import type { Combination } from '@core/draw'
import type { DeriveRequest, GenerateRequest, HumanIdeaInput, IdeaRecord } from '@core/idea'
import type { Settings } from '@core/settings'
import type { Workspace } from '@core/workspace'

export const IpcChannel = {
  appInfo: 'app:info',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  ideaSaveHuman: 'idea:save-human',
  authStatus: 'auth:status',
  authSignIn: 'auth:sign-in',
  authCancelSignIn: 'auth:cancel-sign-in',
  authSignOut: 'auth:sign-out',
  authSetApiKey: 'auth:set-api-key',
  authClearApiKey: 'auth:clear-api-key',
  aiListModels: 'ai:list-models',
  aiGenerate: 'ai:generate',
  aiDerive: 'ai:derive',
  aiCancel: 'ai:cancel',
  openExternal: 'app:open-external'
} as const

/** main → renderer の通知 */
export const AI_EVENT_CHANNEL = 'ai:event'

export type AppInfo = {
  name: string
  version: string
  platform: string
}

export type AuthStatus = {
  chatgpt: {
    signedIn: boolean
    account: { name: string | null; email: string | null } | null
    planUsage: boolean
  }
  apiKey: { configured: boolean; last4: string | null }
  /** false なら秘密の情報を保存できない（サインイン・API キーが使えない） */
  encryptionAvailable: boolean
}

export type ModelOption = { id: string; label: string }

export type AiEvent =
  | {
      jobId: string
      type: 'started'
      total: number
      combination: Combination
      parentId: string | null
      /** 実験的の案に割り当てた変える軸（案の順。実験的以外は null） */
      axes: (string | null)[]
    }
  | { jobId: string; type: 'idea'; index: number; idea: IdeaRecord }
  | { jobId: string; type: 'done'; received: number; skipped: number }
  | { jobId: string; type: 'error'; error: AiErrorInfo; received: number }

/** 失敗しうる操作の戻り値（例外の代わり。renderer で誤りの区別を扱いやすくする） */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AiErrorInfo }

/** preload が window.gameIdeaLab として公開する API */
export type GameIdeaLabApi = {
  getAppInfo: () => Promise<AppInfo>
  /** 保存された作業状態。無い・壊れていれば null */
  loadWorkspace: () => Promise<Workspace | null>
  saveWorkspace: (workspace: Workspace) => Promise<void>
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  saveHumanIdea: (input: HumanIdeaInput) => Promise<IdeaRecord>

  getAuthStatus: () => Promise<AuthStatus>
  /** ブラウザでサインインする。終わるまで待つ */
  signIn: () => Promise<Result<AuthStatus>>
  cancelSignIn: () => Promise<void>
  signOut: () => Promise<{ revoked: boolean; status: AuthStatus }>
  /** API キーは書くだけ。読み出す API は作らない */
  setApiKey: (key: string) => Promise<Result<AuthStatus>>
  clearApiKey: () => Promise<AuthStatus>

  listModels: () => Promise<Result<ModelOption[]>>
  generate: (request: GenerateRequest) => Promise<Result<string>>
  derive: (request: DeriveRequest) => Promise<Result<string>>
  cancelGeneration: (jobId: string) => Promise<void>
  onAiEvent: (listener: (event: AiEvent) => void) => () => void
  /** https の URL を既定のブラウザで開く（Manage usage など） */
  openExternal: (url: string) => Promise<void>
}
