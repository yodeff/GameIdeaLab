// Sign in with ChatGPT のセッション（design/02 §6、DECISIONS/0003）。
// トークンは main の中だけで扱い、renderer には状態（アカウント名など）だけを渡す。
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AiError } from '../ai/errors'
import type { SecretStore } from '../secrets/secretStore'
import {
  AuthError,
  CHATGPT_AUTH,
  buildAuthorizeUrl,
  createPkce,
  randomToken,
  verifyIdToken,
  type IdClaims
} from './oauth'

const HOST_KEY = 'chatgpt-host'
const SESSION_KEY = 'chatgpt-session'
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000
/** 期限のこれだけ前から更新する */
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const UNUSABLE_REFRESH = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused'
])

type HostInfo = { hostId: string; clientId: string | null }

type Session = {
  accessToken: string
  refreshToken: string | null
  idToken: string
  expiresAt: number
  earliestRefreshAt: number | null
  scope: string
  account: IdClaims
}

export type ChatGptStatus = {
  signedIn: boolean
  account: { name: string | null; email: string | null } | null
  planUsage: boolean
}

export type AuthDeps = {
  store: SecretStore
  fetch: typeof fetch
  openExternal: (url: string) => Promise<void>
  now?: () => number
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  earliest_refresh_at?: number | string
  scope?: string
  error?: string
}

const CALLBACK_HTML = (ok: boolean) =>
  `<!doctype html><meta charset="utf-8"><title>Game Idea Lab</title><body style="font-family:sans-serif;padding:2em">` +
  `<p>${ok ? 'サインインを受け取りました。このタブを閉じて Game Idea Lab に戻ってください。' : 'サインインできませんでした。Game Idea Lab に戻ってもう一度試してください。'}</p></body>`

function toEpochMs(v: number | string | undefined, now: number): number | null {
  if (v === undefined) return null
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000 // 秒かミリ秒か
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : Math.max(t, now)
}

export class ChatGptAuth {
  private refreshing: Promise<Session> | null = null
  private signingIn: { cancel: () => void } | null = null
  private readonly now: () => number

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? Date.now
  }

  private async host(): Promise<HostInfo> {
    const saved = await this.deps.store.getJson<HostInfo>(HOST_KEY)
    if (saved?.hostId) return saved
    const created: HostInfo = { hostId: `urn:uuid:${randomUUID()}`, clientId: null }
    await this.deps.store.setJson(HOST_KEY, created)
    return created
  }

  private session(): Promise<Session | null> {
    return this.deps.store.getJson<Session>(SESSION_KEY)
  }

  async status(): Promise<ChatGptStatus> {
    const s = await this.session()
    if (!s) return { signedIn: false, account: null, planUsage: false }
    return {
      signedIn: true,
      account: { name: s.account.name, email: s.account.email },
      planUsage: s.scope.split(' ').includes(CHATGPT_AUTH.planScope)
    }
  }

  /** ブラウザでサインインする。受け口は 127.0.0.1 の空いたポート、5 分で時間切れ（R-9） */
  async signIn(): Promise<ChatGptStatus> {
    this.signingIn?.cancel()
    const host = await this.host()
    const { verifier, challenge } = createPkce()
    const state = randomToken(24)
    const nonce = randomToken(24)

    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const port = (server.address() as AddressInfo).port
    const redirectUri = `http://127.0.0.1:${port}${CHATGPT_AUTH.callbackPath}`
    const previous = await this.session()

    try {
      const callback = this.waitForCallback(server, state)
      await this.deps.openExternal(
        buildAuthorizeUrl({
          clientId: host.clientId,
          hostId: host.hostId,
          redirectUri,
          state,
          nonce,
          challenge,
          ...(previous?.account.email ? { loginHint: previous.account.email } : {})
        })
      )
      const params = await callback
      if (params['error']) throw new AuthError(params['error'], params['error_description'] ?? 'サインインが取り消された')
      const clientId = params['client_id'] ?? host.clientId
      const code = params['code']
      if (!clientId || !code) throw new AuthError('callback', 'コールバックに code または client_id が無い')
      if (params['client_id']) await this.deps.store.setJson(HOST_KEY, { ...host, clientId })

      const tokens = await this.tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        resource: CHATGPT_AUTH.resource
      })
      const session = await this.toSession(tokens, clientId, nonce, null)
      await this.deps.store.setJson(SESSION_KEY, session)
      return await this.status()
    } finally {
      server.close()
    }
  }

  cancelSignIn(): void {
    this.signingIn?.cancel()
  }

  private waitForCallback(server: Server, state: string): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new AuthError('timeout', 'サインインの時間切れ')), SIGN_IN_TIMEOUT_MS)
      const finish = (result: Record<string, string> | Error) => {
        clearTimeout(timer)
        this.signingIn = null
        if (result instanceof Error) reject(result)
        else resolve(result)
      }
      this.signingIn = { cancel: () => finish(new AuthError('cancelled', 'サインインを中止した')) }
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== CHATGPT_AUTH.callbackPath) {
          res.writeHead(404).end()
          return
        }
        const params = Object.fromEntries(url.searchParams)
        if (params['state'] !== state) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('state が一致しません')
          return // ほかからの要求。待ち続ける
        }
        const ok = !params['error']
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_HTML(ok))
        finish(params)
      })
    })
  }

  private async tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
    let res: Response
    try {
      res = await this.deps.fetch(CHATGPT_AUTH.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body)
      })
    } catch (e) {
      throw new AiError('network', e instanceof Error ? e.message : String(e))
    }
    const json = (await res.json().catch(() => ({}))) as TokenResponse
    if (!res.ok || json.error) throw new AuthError(json.error ?? `http-${res.status}`, `トークンの要求が失敗した（${res.status}）`)
    return json
  }

  private async toSession(tokens: TokenResponse, clientId: string, nonce: string | null, previous: Session | null): Promise<Session> {
    if (!tokens.access_token || !tokens.expires_in) throw new AuthError('token-response', 'トークンの応答が足りない')
    const idToken = tokens.id_token ?? previous?.idToken
    if (!idToken) throw new AuthError('token-response', 'ID トークンが無い')
    let account = previous?.account
    if (tokens.id_token && nonce) {
      const jwks = (await (await this.deps.fetch(CHATGPT_AUTH.jwks)).json()) as Parameters<typeof verifyIdToken>[1]
      account = verifyIdToken(tokens.id_token, jwks, { audience: clientId, nonce, nowSeconds: Math.floor(this.now() / 1000) })
    }
    if (!account) throw new AuthError('token-response', 'アカウントが分からない')
    const now = this.now()
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? previous?.refreshToken ?? null,
      idToken,
      expiresAt: now + tokens.expires_in * 1000,
      earliestRefreshAt: toEpochMs(tokens.earliest_refresh_at, now),
      scope: tokens.scope ?? previous?.scope ?? '',
      account
    }
  }

  /** 生成に使うアクセストークン。期限が近ければ更新する。更新は同時に 1 つだけ（ローテーションと競合させない） */
  async getAccessToken(): Promise<string> {
    const s = await this.session()
    if (!s) throw new AiError('not-signed-in')
    if (!s.scope.split(' ').includes(CHATGPT_AUTH.planScope)) throw new AiError('plan-not-granted')
    const now = this.now()
    const due = s.expiresAt - REFRESH_MARGIN_MS <= now
    const allowed = s.earliestRefreshAt === null || s.earliestRefreshAt <= now || s.expiresAt <= now
    if (!due || !allowed || !s.refreshToken) {
      if (s.expiresAt <= now) throw new AiError('auth-failed', 'アクセストークンの期限切れ')
      return s.accessToken
    }
    this.refreshing ??= this.refresh(s).finally(() => {
      this.refreshing = null
    })
    return (await this.refreshing).accessToken
  }

  private async refresh(s: Session): Promise<Session> {
    const clientId = (await this.host()).clientId
    if (!clientId || !s.refreshToken) throw new AiError('auth-failed', '更新に必要な情報が無い')
    try {
      const tokens = await this.tokenRequest({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: s.refreshToken,
        resource: CHATGPT_AUTH.resource
      })
      const next = await this.toSession(tokens, clientId, null, s)
      await this.deps.store.setJson(SESSION_KEY, next)
      return next
    } catch (e) {
      if (e instanceof AuthError && UNUSABLE_REFRESH.has(e.code)) {
        this.deps.store.delete(SESSION_KEY) // 公式の指示: トークンを消して保存した client_id でサインインし直す
        throw new AiError('auth-failed', e.code)
      }
      if (e instanceof AuthError && e.code === 'invalid_client') throw new AiError('config-error', e.code)
      throw e instanceof AiError ? e : new AiError('temporarily-unavailable', e instanceof Error ? e.message : String(e))
    }
  }

  /** サインアウト。失効を送り、手元を消す。失効を確かめられなかったら revoked: false */
  async signOut(): Promise<{ revoked: boolean }> {
    const s = await this.session()
    const clientId = (await this.host()).clientId
    this.deps.store.delete(SESSION_KEY)
    if (!s?.refreshToken || !clientId) return { revoked: true }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.deps.fetch(CHATGPT_AUTH.revoke, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: s.refreshToken, token_type_hint: 'refresh_token', client_id: clientId })
        })
        if (res.ok) return { revoked: true }
        if (res.status < 500) return { revoked: false }
      } catch {
        // 通信の失敗は少し待って繰り返す
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
    return { revoked: false }
  }
}
