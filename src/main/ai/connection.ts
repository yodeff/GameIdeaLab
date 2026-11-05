// AI の接続（DECISIONS/0003）。ChatGPT プランか、利用者自身の API キーか。自動では切り替えない（企画書 §13.5）。
import type { AiConnection } from '@core/settings'
import type { ChatGptAuth } from '../auth/chatgptAuth'
import type { SecretStore } from '../secrets/secretStore'
import { AiError } from './errors'
import { fetchModels, streamResponses, type ModelInfo, type ModelRequest } from './responses'

const API_KEY = 'openai-api-key'
/** プラン利用で一覧に無いときの既定（試作で使えたもの） */
export const DEFAULT_MODEL = 'gpt-6.1-sol'

export type IdeaModelClient = {
  listModels: (signal?: AbortSignal) => Promise<ModelInfo[]>
  stream: (req: ModelRequest, signal: AbortSignal) => AsyncGenerator<string>
}

export type ApiKeyStatus = { configured: boolean; last4: string | null }

export class ApiKeyStore {
  constructor(private readonly store: SecretStore) {}

  async status(): Promise<ApiKeyStatus> {
    const key = await this.get()
    return { configured: key !== null, last4: key ? key.slice(-4) : null }
  }

  async get(): Promise<string | null> {
    return (await this.store.getJson<{ key: string }>(API_KEY))?.key ?? null
  }

  set(key: string): Promise<void> {
    return this.store.setJson(API_KEY, { key })
  }

  clear(): void {
    this.store.delete(API_KEY)
  }
}

export function chatGptClient(auth: ChatGptAuth, fetchFn: typeof fetch): IdeaModelClient {
  const headers = async () => ({ Authorization: `Bearer ${await auth.getAccessToken()}` })
  return {
    listModels: async (signal) => fetchModels(fetchFn, await headers(), signal),
    async *stream(req, signal) {
      yield* streamResponses(fetchFn, await headers(), req, signal)
    }
  }
}

export function apiKeyClient(keys: ApiKeyStore, fetchFn: typeof fetch): IdeaModelClient {
  const headers = async () => {
    const key = await keys.get()
    if (!key) throw new AiError('not-signed-in', 'API キーが設定されていない')
    return { Authorization: `Bearer ${key}` }
  }
  return {
    listModels: async (signal) => fetchModels(fetchFn, await headers(), signal),
    async *stream(req, signal) {
      yield* streamResponses(fetchFn, await headers(), req, signal)
    }
  }
}

export type Connections = { chatgpt: IdeaModelClient; apiKey: IdeaModelClient }

export const clientFor = (connections: Connections, connection: AiConnection): IdeaModelClient => connections[connection]
