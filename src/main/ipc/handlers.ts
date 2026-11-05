// IPC のハンドラー。renderer からの値は信頼せず、src/core の検査関数で確かめてから使う（design/02 §7）。
// Electron に依存しない形にして、テストから直接呼べるようにする。
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { aiErrorInfo } from '@core/aiError'
import { ideasToMarkdown } from '@core/export'
import {
  parseDeriveRequest,
  parseGenerateRequest,
  parseHumanIdeaInput,
  parseIdeaListQuery,
  parseIdeaPatch,
  type IdeaListResult,
  type IdeaRecord
} from '@core/idea'
import { parseSettingsPatch, type Settings } from '@core/settings'
import { isString, isStringArray } from '@core/validate'
import { parseWorkspace, type Workspace } from '@core/workspace'
import { IpcChannel, type AppInfo, type AuthStatus, type ModelOption, type Result } from '@shared/ipc'
import type { ApiKeyStore, IdeaModelClient } from '../ai/connection'
import { AiError } from '../ai/errors'
import type { GenerationJobs } from '../ai/jobs'
import { AuthError } from '../auth/oauth'
import type { ChatGptAuth } from '../auth/chatgptAuth'
import { SecretUnavailableError, type SecretStore } from '../secrets/secretStore'
import {
  deleteIdea,
  getIdeas,
  getSettings,
  insertHumanIdea,
  latestGeneration,
  listIdeas,
  loadWorkspace,
  saveWorkspace,
  updateIdea,
  updateSettings
} from '../storage'

export class InvalidInputError extends Error {
  constructor(what: string) {
    super(`不正な入力: ${what}`)
    this.name = 'InvalidInputError'
  }
}

export type HandlerContext = {
  db: DatabaseSync
  appInfo: () => AppInfo
  secrets: SecretStore
  auth: ChatGptAuth
  apiKeys: ApiKeyStore
  jobs: GenerationJobs
  /** 設定で選んだ接続のクライアント */
  client: () => IdeaModelClient
  openExternal: (url: string) => Promise<void>
  /** 保存ダイアログを出してファイルに書く。取り消したら null、書いたらファイル名 */
  saveTextFile: (defaultName: string, content: string) => Promise<string | null>
  now?: () => Date
  newId?: () => string
}

export type Handlers = Record<(typeof IpcChannel)[keyof typeof IpcChannel], (...args: unknown[]) => unknown>

/** 既定のブラウザで開いてよい先（design/02 §7） */
const EXTERNAL_HOSTS = new Set(['chatgpt.com', 'help.openai.com', 'platform.openai.com', 'openai.com'])
const API_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,200}$/
const ID_MAX = 100

/** ファイル名に使えない文字を除く */
export function markdownFileName(ideas: readonly IdeaRecord[], now: Date): string {
  const first = ideas[0]
  if (ideas.length === 1 && first) {
    const safe = first.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 60)
    if (safe) return `${safe}.md`
  }
  const d = now.toISOString().slice(0, 10).replaceAll('-', '')
  return `game-ideas-${d}.md`
}

function toResult<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  return Promise.resolve()
    .then(fn)
    .then(
      (value): Result<T> => ({ ok: true, value }),
      (e: unknown): Result<T> => {
        if (e instanceof AiError) return { ok: false, error: e.info() }
        if (e instanceof SecretUnavailableError) return { ok: false, error: aiErrorInfo('config-error', e.message) }
        if (e instanceof AuthError) {
          return { ok: false, error: aiErrorInfo(e.code === 'cancelled' ? 'cancelled' : 'auth-failed', `${e.code}: ${e.message}`) }
        }
        return { ok: false, error: aiErrorInfo('config-error', e instanceof Error ? e.message : String(e)) }
      }
    )
}

export function createHandlers(ctx: HandlerContext): Handlers {
  const now = () => (ctx.now?.() ?? new Date()).toISOString()
  const newId = ctx.newId ?? randomUUID
  const authStatus = async (): Promise<AuthStatus> => ({
    chatgpt: await ctx.auth.status(),
    apiKey: await ctx.apiKeys.status(),
    encryptionAvailable: await ctx.secrets.available()
  })

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
    },

    [IpcChannel.ideaList]: (value): IdeaListResult => {
      const query = parseIdeaListQuery(value)
      if (!query) throw new InvalidInputError('一覧の条件')
      return listIdeas(ctx.db, query)
    },
    [IpcChannel.ideaUpdate]: (id, value): IdeaRecord | null => {
      const patch = parseIdeaPatch(value)
      if (!isString(id, ID_MAX, 1) || !patch) throw new InvalidInputError('アイデアの更新')
      return updateIdea(ctx.db, id, patch, now())
    },
    [IpcChannel.ideaDelete]: (id): boolean => {
      if (!isString(id, ID_MAX, 1)) throw new InvalidInputError('アイデアの ID')
      return deleteIdea(ctx.db, id)
    },
    [IpcChannel.ideaLatestGeneration]: (): IdeaRecord[] => latestGeneration(ctx.db),
    [IpcChannel.ideaExportMarkdown]: async (ids): Promise<{ saved: boolean; fileName: string | null }> => {
      if (!isStringArray(ids, 500, ID_MAX) || ids.length === 0) throw new InvalidInputError('出力する案')
      const ideas = getIdeas(ctx.db, ids)
      if (ideas.length === 0) throw new InvalidInputError('出力する案')
      const fileName = await ctx.saveTextFile(markdownFileName(ideas, ctx.now?.() ?? new Date()), ideasToMarkdown(ideas))
      return { saved: fileName !== null, fileName }
    },

    [IpcChannel.authStatus]: (): Promise<AuthStatus> => authStatus(),
    [IpcChannel.authSignIn]: () =>
      toResult(async () => {
        await ctx.auth.signIn()
        return authStatus()
      }),
    [IpcChannel.authCancelSignIn]: (): void => ctx.auth.cancelSignIn(),
    [IpcChannel.authSignOut]: async () => {
      const { revoked } = await ctx.auth.signOut()
      return { revoked, status: await authStatus() }
    },
    [IpcChannel.authSetApiKey]: (value) =>
      toResult(async () => {
        if (!isString(value, 300) || !API_KEY_PATTERN.test(value.trim())) throw new InvalidInputError('API キー')
        await ctx.apiKeys.set(value.trim())
        return authStatus()
      }),
    [IpcChannel.authClearApiKey]: (): Promise<AuthStatus> => {
      ctx.apiKeys.clear()
      return authStatus()
    },

    [IpcChannel.aiListModels]: () => toResult((): Promise<ModelOption[]> => ctx.client().listModels()),
    [IpcChannel.aiGenerate]: (value) =>
      toResult(() => {
        const request = parseGenerateRequest(value)
        if (!request) throw new InvalidInputError('生成の依頼')
        return ctx.jobs.generate(request)
      }),
    [IpcChannel.aiDerive]: (value) =>
      toResult(() => {
        const request = parseDeriveRequest(value)
        if (!request) throw new InvalidInputError('派生の依頼')
        return ctx.jobs.derive(request)
      }),
    [IpcChannel.aiCancel]: (value): void => {
      if (isString(value, 100, 1)) ctx.jobs.cancel(value)
    },
    [IpcChannel.openExternal]: async (value): Promise<void> => {
      if (!isString(value, 2000)) throw new InvalidInputError('URL')
      const url = new URL(value)
      if (url.protocol !== 'https:' || !EXTERNAL_HOSTS.has(url.hostname)) throw new InvalidInputError('URL')
      await ctx.openExternal(url.toString())
    }
  }
}
