import { describe, expect, it } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import { parseModels, streamResponses, type ModelRequest } from '../../src/main/ai/responses'

const req: ModelRequest = { model: 'gpt-6.1-sol', instructions: '指示', input: '依頼', textFormat: { type: 'json_schema' } }

/** 試作（2026-11-05）で記録したイベントの並びを模した SSE */
function sse(events: object[], { chunk = 7, crlf = false } = {}): ReadableStream<Uint8Array> {
  const nl = crlf ? '\r\n' : '\n'
  const text = events.map((e) => `event: ${(e as { type: string }).type}${nl}data: ${JSON.stringify(e)}${nl}${nl}`).join('')
  const bytes = new TextEncoder().encode(text)
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(i, (i += chunk)))
    }
  })
}

const okEvents = (text: string) => [
  { type: 'response.created' },
  { type: 'response.in_progress' },
  { type: 'response.output_item.added' },
  ...[...text].map((ch) => ({ type: 'response.output_text.delta', delta: ch })),
  { type: 'response.metadata' },
  { type: 'response.output_text.done' },
  { type: 'response.completed', response: { output: [], usage: { total_tokens: 10 } } }
]

const fetchReturning = (res: () => Response, seen: { body?: unknown; headers?: unknown } = {}) =>
  (async (_url: string, init?: RequestInit) => {
    seen.body = JSON.parse(String(init?.body))
    seen.headers = init?.headers
    return res()
  }) as unknown as typeof fetch

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = ''
  for await (const s of gen) out += s
  return out
}

describe('streamResponses', () => {
  it('delta をつないで返し、必須の引数を送る（store: false・stream: true・input は配列）', async () => {
    const seen: { body?: unknown; headers?: unknown } = {}
    const fetchFn = fetchReturning(() => new Response(sse(okEvents('{"ideas":[]}'), { crlf: true })), seen)
    const out = await collect(streamResponses(fetchFn, { Authorization: 'Bearer t' }, req, new AbortController().signal))
    expect(out).toBe('{"ideas":[]}')
    expect(seen.body).toMatchObject({ model: 'gpt-6.1-sol', store: false, stream: true, text: { format: { type: 'json_schema' } } })
    expect(Array.isArray((seen.body as { input: unknown }).input)).toBe(true)
    expect(seen.body).not.toHaveProperty('temperature')
    expect(seen.body).not.toHaveProperty('max_output_tokens')
  })

  it.each([
    [429, { error: { code: 'subscription_sharing_usage_limit_exceeded' } }, 'usage-limit'],
    [403, { error: { code: 'subscription_sharing_user_not_eligible' } }, 'not-eligible'],
    [400, { error: { code: 'subscription_sharing_unsupported_capability', param: 'model' } }, 'unsupported'],
    [401, { detail: 'not accepted' }, 'auth-failed'],
    [503, { detail: 'unavailable' }, 'temporarily-unavailable']
  ])('HTTP %i の応答を区別する', async (status, body, kind) => {
    const fetchFn = fetchReturning(() => Response.json(body, { status }))
    await expect(collect(streamResponses(fetchFn, {}, req, new AbortController().signal))).rejects.toMatchObject({ kind })
  })

  it('ストリームの途中の response.failed を区別する', async () => {
    const events = [
      ...okEvents('{"id').slice(0, 5),
      { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }
    ]
    const fetchFn = fetchReturning(() => new Response(sse(events)))
    await expect(collect(streamResponses(fetchFn, {}, req, new AbortController().signal))).rejects.toMatchObject({ kind: 'usage-limit' })
  })

  it('response.incomplete と、完了の無いまま切れたストリームは incomplete', async () => {
    const incomplete = fetchReturning(() => new Response(sse([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'x' } } }])))
    await expect(collect(streamResponses(incomplete, {}, req, new AbortController().signal))).rejects.toMatchObject({ kind: 'incomplete' })
    const cut = fetchReturning(() => new Response(sse(okEvents('abc').slice(0, 5))))
    await expect(collect(streamResponses(cut, {}, req, new AbortController().signal))).rejects.toMatchObject({ kind: 'incomplete' })
  })

  it('中止すると cancelled、通信の失敗は network', async () => {
    const controller = new AbortController()
    const aborting = (async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }) as unknown as typeof fetch
    await expect(collect(streamResponses(aborting, {}, req, controller.signal))).rejects.toMatchObject({ kind: 'cancelled' })
    const failing = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const error = await collect(streamResponses(failing, {}, req, new AbortController().signal)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect(error).toMatchObject({ kind: 'network' })
  })
})

describe('parseModels', () => {
  it('プラン利用の一覧（models・slug・visibility）', () => {
    const json = {
      models: [
        { slug: 'gpt-6.1-sol', visibility: 'list' },
        { slug: 'hidden-model', visibility: 'hide' },
        { slug: 'gpt-6-luna', visibility: 'list', display_name: 'GPT-6 Luna' }
      ]
    }
    expect(parseModels(json)).toEqual([
      { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol', description: null, reasoningLevels: [], defaultReasoning: null },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', description: null, reasoningLevels: [], defaultReasoning: null }
    ])
  })

  it('API キーの一覧（data・id）からは対話のモデルだけ', () => {
    expect(parseModels({ data: [{ id: 'gpt-6.1-sol' }, { id: 'text-embedding-9' }, { id: 'whisper-2' }] })).toEqual([
      { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol', description: null, reasoningLevels: [], defaultReasoning: null }
    ])
  })
})

describe('考える深さ', () => {
  it('モデルの説明・既定・選べる深さを読み、low〜high だけを選択肢にする', () => {
    const json = {
      models: [
        {
          slug: 'gpt-6.1-sol',
          visibility: 'list',
          display_name: 'GPT-6.1-Sol',
          description: 'Latest workhorse model.',
          default_reasoning_level: 'low',
          supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }, { effort: 'ultra' }]
        }
      ]
    }
    expect(parseModels(json)).toEqual([
      { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', description: 'Latest workhorse model.', reasoningLevels: ['low', 'medium', 'high'], defaultReasoning: 'low' }
    ])
  })

  it('指定したときだけ reasoning.effort を送る', async () => {
    const seen: { body?: unknown } = {}
    const fetchFn = fetchReturning(() => new Response(sse(okEvents('{}'))), seen)
    await collect(streamResponses(fetchFn, {}, { ...req, reasoningEffort: 'low' }, new AbortController().signal))
    expect(seen.body).toMatchObject({ reasoning: { effort: 'low' } })
    await collect(streamResponses(fetchFn, {}, req, new AbortController().signal))
    expect(seen.body).not.toHaveProperty('reasoning')
  })
})
