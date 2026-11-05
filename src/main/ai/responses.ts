// Responses API をストリームで呼び、出力の文字を順に返す（調査 §4・§8、DECISIONS/0003 §5）。
// プラン利用の経路では response.completed の output が空なので、途中の delta から組み立てる。
import { AiError, fromFetchError, kindFromCode } from './errors'

export const OPENAI_API = 'https://api.openai.com/v1'

export type ModelRequest = {
  model: string
  instructions: string
  input: string
  textFormat: unknown
}

type SseMessage = { event: string | null; data: string }

/** text/event-stream を読み、空行で区切られた 1 件ずつを返す */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = body.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        let event: string | null = null
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
        }
        if (data.length > 0) yield { event, data: data.join('\n') }
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

type StreamEvent = {
  type?: string
  delta?: string
  code?: string
  message?: string
  response?: { error?: { code?: string; message?: string } | null; incomplete_details?: { reason?: string } | null }
}

/** 誤りの応答の本文から公式のコードを取り出す（{error:{code}} か {detail}） */
function errorCodeOf(text: string): string | undefined {
  try {
    const json = JSON.parse(text) as { error?: { code?: string; type?: string }; detail?: unknown }
    return json.error?.code ?? json.error?.type ?? undefined
  } catch {
    return undefined
  }
}

/** 依頼を送り、出力の文字（output_text の delta）を順に返す。完了しなければ AiError を投げる */
export async function* streamResponses(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  req: ModelRequest,
  signal: AbortSignal
): AsyncGenerator<string> {
  let res: Response
  try {
    res = await fetchFn(`${OPENAI_API}/responses`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        model: req.model,
        instructions: req.instructions,
        input: [{ role: 'user', content: [{ type: 'input_text', text: req.input }] }],
        text: { format: req.textFormat },
        store: false,
        stream: true
      }),
      signal
    })
  } catch (e) {
    throw fromFetchError(e, signal)
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    const code = errorCodeOf(text)
    throw new AiError(kindFromCode(code, res.status), code ?? `HTTP ${res.status}`)
  }

  let completed = false
  try {
    for await (const message of readSse(res.body)) {
      if (message.data === '[DONE]') break
      let event: StreamEvent
      try {
        event = JSON.parse(message.data) as StreamEvent
      } catch {
        continue
      }
      const type = event.type ?? message.event
      if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
        yield event.delta
      } else if (type === 'response.completed') {
        completed = true
      } else if (type === 'response.failed') {
        const code = event.response?.error?.code
        throw new AiError(kindFromCode(code, 500), code ?? 'response.failed')
      } else if (type === 'response.incomplete') {
        throw new AiError('incomplete', event.response?.incomplete_details?.reason ?? 'response.incomplete')
      } else if (type === 'error') {
        throw new AiError(kindFromCode(event.code, 500), event.code ?? event.message ?? 'error')
      }
    }
  } catch (e) {
    throw fromFetchError(e, signal)
  }
  if (!completed) throw signal.aborted ? new AiError('cancelled') : new AiError('incomplete', 'ストリームが途中で切れた')
}

export type ModelInfo = { id: string; label: string }

/** モデル一覧。プラン利用は {models:[{slug, visibility}]}、API キーは {data:[{id}]}（LEARNINGS L-5） */
export function parseModels(json: unknown): ModelInfo[] {
  if (typeof json !== 'object' || json === null) return []
  const record = json as { models?: unknown; data?: unknown }
  if (Array.isArray(record.models)) {
    return record.models
      .filter((m): m is { slug: string; visibility?: string; display_name?: string } => typeof m?.slug === 'string')
      .filter((m) => m.visibility === undefined || m.visibility === 'list')
      .map((m) => ({ id: m.slug, label: m.display_name ?? m.slug }))
  }
  if (Array.isArray(record.data)) {
    return record.data
      .filter((m): m is { id: string } => typeof m?.id === 'string')
      .filter((m) => /^(gpt-|o\d)/.test(m.id))
      .map((m) => ({ id: m.id, label: m.id }))
      .sort((a, b) => b.id.localeCompare(a.id))
  }
  return []
}

export async function fetchModels(fetchFn: typeof fetch, headers: Record<string, string>, signal?: AbortSignal): Promise<ModelInfo[]> {
  let res: Response
  try {
    res = await fetchFn(`${OPENAI_API}/models`, { headers, ...(signal ? { signal } : {}) })
  } catch (e) {
    throw fromFetchError(e, signal)
  }
  if (!res.ok) {
    const code = errorCodeOf(await res.text().catch(() => ''))
    throw new AiError(kindFromCode(code, res.status), code ?? `HTTP ${res.status}`)
  }
  return parseModels(await res.json())
}
