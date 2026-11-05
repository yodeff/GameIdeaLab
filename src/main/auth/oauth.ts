// Sign in with ChatGPT の OAuth の部品（調査 §3・§5・§8）。純粋な計算と、ID トークンの検査。
import { createHash, createPublicKey, randomBytes, verify, type JsonWebKeyInput } from 'node:crypto'

export const CHATGPT_AUTH = {
  issuer: 'https://auth.openai.com',
  authorize: 'https://auth.openai.com/api/accounts/authorize',
  token: 'https://auth.openai.com/api/accounts/oauth/token',
  revoke: 'https://auth.openai.com/api/accounts/oauth/revoke',
  jwks: 'https://auth.openai.com/.well-known/jwks.json',
  resource: 'https://api.openai.com/v1',
  scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  planScope: 'chatgpt.tokens.use.direct',
  dynamicClientId: 'dynamic_agent_client',
  callbackPath: '/auth/callback',
  agentName: 'Game Idea Lab'
} as const

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(32)
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export type AuthorizeParams = {
  clientId: string | null
  hostId: string
  redirectUri: string
  state: string
  nonce: string
  challenge: string
  loginHint?: string
}

/** 認可の URL。初回は dynamic_agent_client と agent_name_hint、2 回目からは保存した client_id */
export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const params = new URLSearchParams({
    client_id: p.clientId ?? CHATGPT_AUTH.dynamicClientId,
    ext_agent_host_id: p.hostId,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    scope: CHATGPT_AUTH.scope,
    resource: CHATGPT_AUTH.resource,
    state: p.state,
    nonce: p.nonce,
    code_challenge_method: 'S256',
    code_challenge: p.challenge
  })
  if (!p.clientId) params.set('agent_name_hint', CHATGPT_AUTH.agentName)
  if (p.loginHint) params.set('login_hint', p.loginHint)
  return `${CHATGPT_AUTH.authorize}?${params}`
}

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export type IdClaims = { sub: string; email: string | null; name: string | null }

type Jwks = { keys: (JsonWebKeyInput['key'] & { kid?: string })[] }

/** ID トークンを JWKS で検査する（調査 §3 の 6） */
export function verifyIdToken(
  idToken: string,
  jwks: Jwks,
  expected: { audience: string; nonce: string; nowSeconds: number }
): IdClaims {
  const [h, p, s] = idToken.split('.')
  if (!h || !p || !s) throw new AuthError('id-token-format', 'ID トークンの形が違う')
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string }
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>
  if (header.alg !== 'RS256') throw new AuthError('id-token-alg', `想定外の署名方式: ${header.alg}`)
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new AuthError('id-token-kid', '署名の鍵が見つからない')
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'))
  if (!ok) throw new AuthError('id-token-signature', '署名が正しくない')
  if (payload['iss'] !== CHATGPT_AUTH.issuer) throw new AuthError('id-token-issuer', '発行元が違う')
  const aud = Array.isArray(payload['aud']) ? payload['aud'] : [payload['aud']]
  if (!aud.includes(expected.audience)) throw new AuthError('id-token-audience', '宛先が違う')
  if (typeof payload['exp'] !== 'number' || payload['exp'] <= expected.nowSeconds) throw new AuthError('id-token-expired', '期限切れ')
  if (payload['nonce'] !== expected.nonce) throw new AuthError('id-token-nonce', 'nonce が違う')
  if (typeof payload['sub'] !== 'string') throw new AuthError('id-token-sub', 'sub が無い')
  return {
    sub: payload['sub'],
    email: typeof payload['email'] === 'string' ? payload['email'] : null,
    name: typeof payload['name'] === 'string' ? payload['name'] : null
  }
}
