// IPC のハンドラー。renderer からの値は信頼せず、src/core の検査関数で確かめてから保存する（design/02 §7）。
// Electron に依存しない形にして、テストから直接呼べるようにする。
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { parseHumanIdeaInput, type IdeaRecord } from '@core/idea'
import { parseSettingsPatch, type Settings } from '@core/settings'
import { parseWorkspace, type Workspace } from '@core/workspace'
import { IpcChannel, type AppInfo } from '@shared/ipc'
import { getSettings, insertHumanIdea, loadWorkspace, saveWorkspace, updateSettings } from '../storage'

export class InvalidInputError extends Error {
  constructor(what: string) {
    super(`不正な入力: ${what}`)
    this.name = 'InvalidInputError'
  }
}

export type HandlerContext = {
  db: DatabaseSync
  appInfo: () => AppInfo
  now?: () => Date
  newId?: () => string
}

export type Handlers = Record<(typeof IpcChannel)[keyof typeof IpcChannel], (...args: unknown[]) => unknown>

export function createHandlers(ctx: HandlerContext): Handlers {
  const now = () => (ctx.now?.() ?? new Date()).toISOString()
  const newId = ctx.newId ?? randomUUID

  return {
    [IpcChannel.appInfo]: (): AppInfo => ctx.appInfo(),
    [IpcChannel.workspaceLoad]: (): Workspace | null => loadWorkspace(ctx.db),
    [IpcChannel.workspaceSave]: (value): void => {
      const workspace = parseWorkspace(value)
      if (!workspace) throw new InvalidInputError('作業状態')
      saveWorkspace(ctx.db, workspace)
    },
    [IpcChannel.settingsGet]: (): Settings => getSettings(ctx.db),
    [IpcChannel.settingsUpdate]: (value): Settings => {
      const patch = parseSettingsPatch(value)
      if (!patch) throw new InvalidInputError('設定')
      return updateSettings(ctx.db, patch)
    },
    [IpcChannel.ideaSaveHuman]: (value): IdeaRecord => {
      const input = parseHumanIdeaInput(value)
      if (!input) throw new InvalidInputError('アイデア')
      return insertHumanIdea(ctx.db, input, newId(), now())
    }
  }
}
