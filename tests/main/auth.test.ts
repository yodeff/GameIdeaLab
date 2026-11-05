import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import { ChatGptAuth } from '../../src/main/auth/chatgptAuth'
import { CHATGPT_AUTH, verifyIdToken } from '../../src/main/auth/oauth'
import { SecretStore, SecretUnavailableError } from '../../src/main/secrets/secretStore'
import { fakeEncryptor } from '../support/secrets'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const newStore = (available = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'gil-secret-'))
  dirs.push(dir)
  return { store: new SecretStore(dir, fakeEncryptor(available)), dir }
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }

function idToken(claims: Record<string, unknown>, kid = 'test-key'): string {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url')
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`
}

const NOW = 1_800_000_000_000

type FakeServer = {
  auth: ChatGptAuth
  tokenCalls: URLSearchParams[]
  revokeCalls: URLSearchParams[]
  openedUrls: URL[]
  setNow: (ms: number) => void
  nextToken: { scope: string; error?: string; nonceOverride?: string }
}

function setup(store: SecretStore): FakeServer {
  let now = NOW
  const tokenCalls: URLSearchParams[] = []
  const revokeCalls: URLSearchParams[] = []
  const openedUrls: URL[] = []
  let lastNonce = ''
  let issued = 0
  const server: FakeServer = {
    tokenCalls,
    revokeCalls,
    openedUrls,
    setNow: (ms) => {
      now = ms
    },
    nextToken: { scope: CHATGPT_AUTH.scope },
    auth: undefined as unknown as ChatGptAuth
  }
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === CHATGPT_AUTH.jwks) return Response.json({ keys: [jwk] })
    if (url === CHATGPT_AUTH.revoke) {
      revokeCalls.push(new URLSearchParams(String(init?.body)))
      return new Response('', { status: 200 })
    }
    if (url === CHATGPT_AUTH.token) {
      const body = new URLSearchParams(String(init?.body))
      tokenCalls.push(body)
      await new Promise((r) => setTimeout(r, 20))
      if (server.nextToken.error) return Response.json({ error: server.nextToken.error }, { status: 400 })
      issued++
      const clientId = body.get('client_id') ?? ''
      return Response.json({
        access_token: `access-${issued}`,
        refresh_token: `refresh-${issued}`,
        id_token: idToken({
          iss: CHATGPT_AUTH.issuer,
          aud: clientId,
          exp: Math.floor(now / 1000) + 3600,
          nonce: server.nextToken.nonceOverride ?? lastNonce,
          sub: 'user-1',
          email: 'player@example.com',
          name: 'Player'
        }),
        expires_in: 3600,
        scope: server.nextToken.scope
      })
    }
    throw new Error(`想定外の URL: ${url}`)
  }) as typeof fetch

  // 偽のブラウザ: 認可の URL を受け取り、loopback の受け口へ code を返す。最初に state の違う要求も送る
  const openExternal = async (raw: string) => {
    const url = new URL(raw)
    openedUrls.push(url)
    lastNonce = url.searchParams.get('nonce') ?? ''
    const redirect = url.searchParams.get('redirect_uri') ?? ''
    const state = url.searchParams.get('state') ?? ''
    const isNew = url.searchParams.get('client_id') === CHATGPT_AUTH.dynamicClientId
    setTimeout(async () => {
      await fetch(`${redirect}?code=x&state=wrong`)
      await fetch(`${redirect}?code=code-1&state=${state}${isNew ? '&client_id=oaiapp_test' : ''}`)
    }, 10)
  }
  server.auth = new ChatGptAuth({ store, fetch: fakeFetch, openExternal, now: () => now })
  return server
}

describe('SecretStore', () => {
  it('暗号化して書き、読み戻す。ファイルに平文が残らない', async () => {
    const { store, dir } = newStore()
    await store.setJson('chatgpt-session', { token: 'secret-value' })
    expect(await store.getJson('chatgpt-session')).toEqual({ token: 'secret-value' })
    const raw = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('')
    expect(raw).not.toContain('secret-value')
  })

  it('暗号化できない環境では書かない', async () => {
    const { store, dir } = newStore(false)
    await expect(store.setJson('api-key', { key: 'sk-test' })).rejects.toThrow(SecretUnavailableError)
    expect(readdirSync(dir)).toEqual([])
  })

  it('鍵が入れ替わった（shouldReEncrypt）ら新しい鍵で書き直す', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gil-secret-'))
    dirs.push(dir)
    await new SecretStore(dir, fakeEncryptor()).setJson('chatgpt-host', { hostId: 'h' })
    const before = statSync(join(dir, 'chatgpt-host.bin')).mtimeMs
    await new Promise((r) => setTimeout(r, 20))
    expect(await new SecretStore(dir, fakeEncryptor(true, true)).getJson('chatgpt-host')).toEqual({ hostId: 'h' })
    expect(statSync(join(dir, 'chatgpt-host.bin')).mtimeMs).toBeGreaterThan(before)
  })

  it('キーの形が違えば例外', async () => {
    await expect(newStore().store.setJson('../evil', 1)).rejects.toThrow()
  })
})

describe('verifyIdToken', () => {
  const claims = { iss: CHATGPT_AUTH.issuer, aud: 'oaiapp_x', exp: 2_000_000_000, nonce: 'n', sub: 's' }
  const expected = { audience: 'oaiapp_x', nonce: 'n', nowSeconds: 1_900_000_000 }

  it('正しいトークンを受け入れる', () => {
    expect(verifyIdToken(idToken(claims), { keys: [jwk] }, expected)).toEqual({ sub: 's', email: null, name: null })
  })

  it.each([
    ['nonce', { nonce: 'other' }],
    ['宛先', { aud: 'oaiapp_other' }],
    ['発行元', { iss: 'https://evil.example.com' }],
    ['期限', { exp: 1_000 }]
  ])('%s が違えば拒否する', (_name, override) => {
    expect(() => verifyIdToken(idToken({ ...claims, ...override }), { keys: [jwk] }, expected)).toThrow()
  })

  it('署名が違えば拒否する', () => {
    const token = idToken(claims)
    const tampered = token.replace(/\.[^.]+\./, `.${Buffer.from(JSON.stringify({ ...claims, sub: 'attacker' })).toString('base64url')}.`)
    expect(() => verifyIdToken(tampered, { keys: [jwk] }, expected)).toThrow(/署名/)
  })
})

describe('ChatGptAuth', () => {
  it('初回は動的登録で始め、発行された client_id を保存してサインインする', async () => {
    const s = setup(newStore().store)
    const status = await s.auth.signIn()
    expect(status).toEqual({ signedIn: true, account: { name: 'Player', email: 'player@example.com' }, planUsage: true })
    const url = s.openedUrls[0]
    expect(url?.searchParams.get('client_id')).toBe(CHATGPT_AUTH.dynamicClientId)
    expect(url?.searchParams.get('agent_name_hint')).toBe('Game Idea Lab')
    expect(url?.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)
    expect(url?.searchParams.get('code_challenge_method')).toBe('S256')
    expect(s.tokenCalls[0]?.get('client_id')).toBe('oaiapp_test')
    expect(s.tokenCalls[0]?.get('code')).toBe('code-1')
  })

  it('2 回目は保存した client_id で再認可し、agent_name_hint を送らない', async () => {
    const s = setup(newStore().store)
    await s.auth.signIn()
    await s.auth.signIn()
    const second = s.openedUrls[1]
    expect(second?.searchParams.get('client_id')).toBe('oaiapp_test')
    expect(second?.searchParams.has('agent_name_hint')).toBe(false)
    expect(second?.searchParams.get('login_hint')).toBe('player@example.com')
  })

  it('ID トークンの nonce が違えばサインインしない', async () => {
    const s = setup(newStore().store)
    s.nextToken.nonceOverride = 'forged'
    await expect(s.auth.signIn()).rejects.toThrow(/nonce/)
    expect((await s.auth.status()).signedIn).toBe(false)
  })

  it('プラン利用のスコープが無ければ plan-not-granted', async () => {
    const s = setup(newStore().store)
    s.nextToken.scope = 'openid profile email offline_access'
    await s.auth.signIn()
    expect((await s.auth.status()).planUsage).toBe(false)
    await expect(s.auth.getAccessToken()).rejects.toMatchObject({ kind: 'plan-not-granted' })
  })

  it('期限が近いとき、同時に呼ばれても更新は 1 回だけ', async () => {
    const s = setup(newStore().store)
    await s.auth.signIn()
    expect(await s.auth.getAccessToken()).toBe('access-1')
    s.setNow(NOW + 3600 * 1000 - 60_000)
    const tokens = await Promise.all([s.auth.getAccessToken(), s.auth.getAccessToken(), s.auth.getAccessToken()])
    expect(tokens).toEqual(['access-2', 'access-2', 'access-2'])
    const refreshes = s.tokenCalls.filter((b) => b.get('grant_type') === 'refresh_token')
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]?.get('refresh_token')).toBe('refresh-1')
  })

  it('更新できないリフレッシュトークンなら手元を消して auth-failed', async () => {
    const s = setup(newStore().store)
    await s.auth.signIn()
    s.setNow(NOW + 3600 * 1000)
    s.nextToken.error = 'refresh_token_reused'
    await expect(s.auth.getAccessToken()).rejects.toBeInstanceOf(AiError)
    expect((await s.auth.status()).signedIn).toBe(false)
  })

  it('サインアウトで失効を送り、手元を消す', async () => {
    const s = setup(newStore().store)
    await s.auth.signIn()
    expect(await s.auth.signOut()).toEqual({ revoked: true })
    expect(s.revokeCalls[0]?.get('token')).toBe('refresh-1')
    expect((await s.auth.status()).signedIn).toBe(false)
  })

  it('サインインしていなければ not-signed-in', async () => {
    await expect(setup(newStore().store).auth.getAccessToken()).rejects.toMatchObject({ kind: 'not-signed-in' })
  })
})
