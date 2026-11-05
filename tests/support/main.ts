import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AiEvent } from '@shared/ipc'
import { ApiKeyStore, type IdeaModelClient } from '../../src/main/ai/connection'
import { GenerationJobs } from '../../src/main/ai/jobs'
import type { ModelRequest } from '../../src/main/ai/responses'
import { ChatGptAuth } from '../../src/main/auth/chatgptAuth'
import { createHandlers } from '../../src/main/ipc/handlers'
import { SecretStore } from '../../src/main/secrets/secretStore'
import { getSettings, openDatabase } from '../../src/main/storage'
import { fakeEncryptor } from './secrets'

/** 決まった文字列を少しずつ返す偽のモデル。fail を渡すと途中で投げる。中止に反応する */
export function scriptedClient(chunks: string[], opts: { fail?: Error; delayMs?: number } = {}) {
  const requests: ModelRequest[] = []
  const client: IdeaModelClient = {
    listModels: async () => [{ id: 'gpt-6.1-sol', label: 'gpt-6.1-sol' }],
    async *stream(req, signal) {
      requests.push(req)
      for (const chunk of chunks) {
        await new Promise((r) => setTimeout(r, opts.delayMs ?? 1))
        if (signal.aborted) {
          const { AiError } = await import('../../src/main/ai/errors')
          throw new AiError('cancelled')
        }
        yield chunk
      }
      if (opts.fail) throw opts.fail
    }
  }
  return { client, requests }
}

export function setupMain(client: IdeaModelClient) {
  const db = openDatabase(':memory:')
  const events: AiEvent[] = []
  const waiters: (() => void)[] = []
  let id = 0
  const jobs = new GenerationJobs({
    db,
    settings: () => getSettings(db),
    client: () => client,
    emit: (e) => {
      events.push(e)
      if (e.type === 'done' || e.type === 'error') waiters.splice(0).forEach((w) => w())
    },
    newId: () => `id-${++id}`,
    now: () => new Date(Date.UTC(2026, 10, 5, 0, 0, id))
  })
  const secrets = new SecretStore(mkdtempSync(join(tmpdir(), 'gil-main-')), fakeEncryptor())
  const auth = new ChatGptAuth({
    store: secrets,
    fetch: (async () => {
      throw new Error('テストでは通信しない')
    }) as unknown as typeof fetch,
    openExternal: async () => {}
  })
  const opened: string[] = []
  const savedFiles: { name: string; content: string }[] = []
  const handlers = createHandlers({
    db,
    appInfo: () => ({ name: 'test', version: '0.0.0', platform: 'test' }),
    secrets,
    auth,
    apiKeys: new ApiKeyStore(secrets),
    jobs,
    client: () => client,
    openExternal: async (url) => {
      opened.push(url)
    },
    saveTextFile: async (name, content) => {
      savedFiles.push({ name, content })
      return name
    },
    now: () => new Date('2026-11-05T00:00:00.000Z'),
    newId: () => 'fixed-id'
  })
  const finished = () => new Promise<void>((resolve) => waiters.push(resolve))
  return { db, jobs, events, handlers, finished, opened, savedFiles }
}

/** 文字列を n 文字ずつに分ける */
export const chunk = (text: string, n = 9) => Array.from({ length: Math.ceil(text.length / n) }, (_, i) => text.slice(i * n, i * n + n))
