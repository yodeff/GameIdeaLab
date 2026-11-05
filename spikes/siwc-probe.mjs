// Sign in with ChatGPT の試作（STEP 2.5、docs/DECISIONS/0003 §4）。本体には組み込まない。
// 使い方: node spikes/siwc-probe.mjs [モデル名]
//
// 1. 127.0.0.1 で受け口を開き、既定のブラウザで認可の画面を開く（利用者が自分でサインインする）
// 2. コードを交換し、ID トークンを JWKS で検査し、付与されたスコープを確かめる
// 3. モデル一覧を取り、3 通りの受け取り方（文章・JSON Schema・関数ツール）で 3 案の生成を試す
// 4. 最後にリフレッシュトークンを失効させる（サインアウト）
//
// トークンはメモリにだけ置き、画面にもファイルにも書かない。
// 結果（トークンを含まない）は private/spike-siwc-result.json に書く（git 管理外）。
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const AUTH = {
  issuer: 'https://auth.openai.com',
  authorize: 'https://auth.openai.com/api/accounts/authorize',
  token: 'https://auth.openai.com/api/accounts/oauth/token',
  revoke: 'https://auth.openai.com/api/accounts/oauth/revoke',
  jwks: 'https://auth.openai.com/.well-known/jwks.json'
}
const API = 'https://api.openai.com/v1'
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const CALLBACK_PATH = '/auth/callback'
const STATE_FILE = 'private/spike-siwc-state.json' // ホスト ID と発行された client_id（秘密ではない）
const RESULT_FILE = 'private/spike-siwc-result.json'
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const log = (...args) => console.log('[probe]', ...args)
const result = { startedAt: new Date().toISOString(), steps: {} }

function loadState() {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  return { hostId: `urn:uuid:${randomUUID()}`, clientId: null }
}

function saveJson(path, value) {
  mkdirSync('private', { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

function openBrowser(url) {
  // cmd の start は URL の & を区切りとして扱うので使わない
  spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref()
}

async function waitForCallback(server, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('サインインの時間切れ')), SIGN_IN_TIMEOUT_MS)
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end()
        return
      }
      const params = Object.fromEntries(url.searchParams)
      if (params.state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('state が一致しません')
        return // 別の要求。待ち続ける
      }
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<p>Game Idea Lab の試作: サインインを受け取りました。このタブは閉じてかまいません。</p>')
      clearTimeout(timer)
      resolve(params)
    })
  })
}

async function verifyIdToken(idToken, clientId, nonce) {
  const [h, p, s] = idToken.split('.')
  const header = JSON.parse(Buffer.from(h, 'base64url').toString())
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
  const jwks = await (await fetch(AUTH.jwks)).json()
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new Error(`JWKS に kid が無い: ${header.kid}`)
  if (header.alg !== 'RS256') throw new Error(`想定外の alg: ${header.alg}`)
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  const checks = {
    signature: ok,
    issuer: payload.iss === AUTH.issuer,
    audience: aud.includes(clientId),
    notExpired: payload.exp * 1000 > Date.now(),
    nonce: payload.nonce === nonce
  }
  return { checks, claims: Object.keys(payload).sort(), alg: header.alg }
}

// Responses API をストリームで呼び、イベントを集める
async function respond(accessToken, body) {
  const started = Date.now()
  const res = await fetch(`${API}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, store: false, stream: true })
  })
  if (!res.ok || !res.body) {
    return { ok: false, httpStatus: res.status, error: await res.text().then((t) => t.slice(0, 1000)) }
  }
  const decoder = new TextDecoder()
  let buffer = ''
  let firstDeltaMs = null
  let text = ''
  let final = null
  let functionArguments = null
  const outputTypes = []
  const eventTypes = new Set()
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n')
      if (!data || data === '[DONE]') continue
      const event = JSON.parse(data)
      eventTypes.add(event.type)
      if (event.type?.endsWith('.delta')) {
        firstDeltaMs ??= Date.now() - started
        if (event.type === 'response.output_text.delta') text += event.delta
      }
      // 完了イベントの response.output は空で届く（2026-11-05 の試作）。出力はストリームの途中のイベントから拾う
      if (event.type === 'response.output_item.done') outputTypes.push(event.item?.type)
      if (event.type === 'response.function_call_arguments.done') functionArguments = event.arguments
      if (['response.completed', 'response.failed', 'response.incomplete', 'error'].includes(event.type)) final = event
    }
  }
  const response = final?.response
  return {
    ok: final?.type === 'response.completed',
    finalEvent: final?.type ?? null,
    error: response?.error ?? (final?.type === 'error' ? final : null),
    incompleteDetails: response?.incomplete_details ?? null,
    firstDeltaMs,
    totalMs: Date.now() - started,
    usage: response?.usage ?? null,
    eventTypes: [...eventTypes],
    outputTypes,
    text,
    functionArguments
  }
}

const IDEA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['direction', 'title', 'concept', 'player_actions', 'core_loop', 'fun_core', 'keyword_mechanics'],
        properties: {
          direction: { type: 'string', enum: ['王道', '変化球', '実験的'] },
          title: { type: 'string' },
          concept: { type: 'string' },
          player_actions: { type: 'string' },
          core_loop: { type: 'string' },
          fun_core: { type: 'string' },
          keyword_mechanics: { type: 'string' }
        }
      }
    }
  }
}

const INSTRUCTIONS = [
  'あなたはゲームデザイナーです。与えられた 2 つのキーワードとゲームジャンルから、遊びとして成立するゲームのアイデアを考えます。',
  '世界観や物語より、プレイヤーの操作・目的・判断・繰り返すこと（コアループ）を具体的に書きます。',
  'キーワードを名前や飾りだけに使わず、ゲームのルールに反映します。関連の薄い組み合わせを無難な組み合わせに置き換えません。',
  '3 案はそれぞれ「王道」「変化球」「実験的」の方向で、互いにはっきり違うものにします。各項目は 1〜2 文で短く書きます。'
].join('\n')
const PROMPT = 'キーワード1: 自動販売機\nキーワード2: 寄生\nゲームジャンル: 経営シミュレーション\n\n3 案を出してください。'

async function main() {
  const preferredModel = process.argv[2]
  const state = loadState()
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const oauthState = b64url(randomBytes(24))
  const nonce = b64url(randomBytes(24))

  const server = createServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`

  const params = new URLSearchParams({
    client_id: state.clientId ?? 'dynamic_agent_client',
    ext_agent_host_id: state.hostId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
    resource: API,
    state: oauthState,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge
  })
  if (!state.clientId) params.set('agent_name_hint', 'Game Idea Lab (prototype)')
  result.steps.authorize = { firstRegistration: !state.clientId, port }

  log('ブラウザで認可の画面を開きます。自分の ChatGPT アカウントでサインインし、同意してください。')
  openBrowser(`${AUTH.authorize}?${params}`)
  const callback = await waitForCallback(server, oauthState)
  server.close()

  if (callback.error) {
    result.steps.callback = { error: callback.error, description: callback.error_description ?? null }
    throw new Error(`認可の失敗: ${callback.error}`)
  }
  const clientId = callback.client_id ?? state.clientId
  result.steps.callback = { gotCode: Boolean(callback.code), issuedClientId: Boolean(callback.client_id), scope: callback.scope ?? null }
  if (callback.client_id) saveJson(STATE_FILE, { ...state, clientId: callback.client_id })

  const tokenRes = await fetch(AUTH.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: callback.code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: API
    })
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) {
    result.steps.token = { httpStatus: tokenRes.status, error: tokens.error ?? tokens }
    throw new Error(`コードの交換に失敗: ${tokenRes.status}`)
  }
  const granted = (tokens.scope ?? '').split(' ')
  result.steps.token = {
    fields: Object.keys(tokens).sort(),
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
    planUsageGranted: granted.includes('chatgpt.tokens.use.direct')
  }
  result.steps.idToken = await verifyIdToken(tokens.id_token, clientId, nonce)
  log('サインイン完了。プラン利用:', result.steps.token.planUsageGranted)

  try {
    const modelsRes = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    const models = await modelsRes.json()
    // 一覧の形が文書から読み切れないので、配列のありかと生の形を記録する
    const all = models.data ?? models.models ?? (Array.isArray(models) ? models : [])
    const idOf = (m) => m.id ?? m.slug ?? m.name
    const listed = all.filter((m) => m.visibility === undefined || m.visibility === 'list')
    result.steps.models = {
      httpStatus: modelsRes.status,
      topKeys: Array.isArray(models) ? ['(array)'] : Object.keys(models),
      raw: JSON.stringify(models).slice(0, 3000),
      count: all.length,
      listed: listed.map(idOf),
      hasVisibilityField: all.some((m) => 'visibility' in m),
      error: modelsRes.ok ? null : models
    }
    // 一覧が空でも、文書の例のモデルで生成を試す（誤りの内容も結果になる）
    const model = preferredModel ?? listed.map(idOf).find((id) => id === 'gpt-6.1-sol') ?? listed.map(idOf)[0] ?? 'gpt-6.1-sol'
    result.model = model
    log('モデル:', model, '/ 一覧:', result.steps.models.listed.join(', '))

    const base = { model, instructions: INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text: PROMPT }] }] }

    log('試験 1/3: 文章で受け取る')
    result.steps.plainText = await respond(tokens.access_token, base)
    log('試験 2/3: JSON Schema（text.format）で受け取る')
    result.steps.jsonSchema = await respond(tokens.access_token, {
      ...base,
      text: { format: { type: 'json_schema', name: 'game_ideas', schema: IDEA_SCHEMA, strict: true } }
    })
    log('試験 3/3: 関数ツールで受け取る')
    result.steps.functionTool = await respond(tokens.access_token, {
      ...base,
      tools: [{ type: 'function', name: 'submit_ideas', description: '考えたゲームのアイデアを提出する', parameters: IDEA_SCHEMA, strict: true }],
      tool_choice: 'required'
    })
  } finally {
    const revokeRes = await fetch(AUTH.revoke, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: 'refresh_token', client_id: clientId })
    })
    result.steps.revoke = { httpStatus: revokeRes.status, body: (await revokeRes.text()).slice(0, 300) }
    log('サインアウト（失効）:', revokeRes.status)
  }
}

main()
  .catch((e) => {
    result.fatal = String(e?.message ?? e)
    console.error('[probe] 失敗:', result.fatal)
    process.exitCode = 1
  })
  .finally(() => {
    result.finishedAt = new Date().toISOString()
    saveJson(RESULT_FILE, result)
    for (const key of ['plainText', 'jsonSchema', 'functionTool']) {
      const r = result.steps[key]
      if (r) log(`${key}: ok=${r.ok} final=${r.finalEvent ?? r.httpStatus} 最初の出力 ${r.firstDeltaMs}ms 全体 ${r.totalMs}ms`)
    }
    log(`結果: ${RESULT_FILE}`)
  })
