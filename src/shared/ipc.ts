// main・preload・renderer が共有する IPC の契約（design/02 §3）。
// renderer へ公開する機能はここに型として列挙し、preload はこの型どおりにだけ橋渡しする。
import type { HumanIdeaInput, IdeaRecord } from '@core/idea'
import type { Settings } from '@core/settings'
import type { Workspace } from '@core/workspace'

export const IpcChannel = {
  appInfo: 'app:info',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  ideaSaveHuman: 'idea:save-human'
} as const

export type AppInfo = {
  name: string
  version: string
  platform: string
}

/** preload が window.gameIdeaLab として公開する API */
export type GameIdeaLabApi = {
  getAppInfo: () => Promise<AppInfo>
  /** 保存された作業状態。無い・壊れていれば null */
  loadWorkspace: () => Promise<Workspace | null>
  saveWorkspace: (workspace: Workspace) => Promise<void>
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  saveHumanIdea: (input: HumanIdeaInput) => Promise<IdeaRecord>
}
