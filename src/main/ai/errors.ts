// main の中で投げる AI の誤り。kind は画面の表示の区別（src/core/aiError.ts）
import { aiErrorInfo, type AiErrorInfo, type AiErrorKind } from '@core/aiError'

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    readonly detail?: string
  ) {
    super(`${kind}${detail ? `: ${detail}` : ''}`)
    this.name = 'AiError'
  }

  info(): AiErrorInfo {
    return aiErrorInfo(this.kind, this.detail)
  }
}

/** 公式の誤りのコード（調査 §6）から区別を決める */
export function kindFromCode(code: string | undefined, status: number): AiErrorKind {
  switch (code) {
    case 'subscription_sharing_user_not_eligible':
      return 'not-eligible'
    case 'subscription_sharing_usage_limit_exceeded':
      return 'usage-limit'
    case 'subscription_sharing_usage_unavailable':
    case 'subscription_sharing_user_unavailable':
      return 'temporarily-unavailable'
    case 'subscription_sharing_unsupported_capability':
    case 'model_not_found':
      return 'unsupported'
    case 'subscription_sharing_invalid_user':
    case 'invalid_api_key':
      return 'auth-failed'
    case 'subscription_sharing_route_not_supported':
    case 'chatpass_v2_scope_not_authorized':
    case 'chatpass_v2_invalid_authorization_context':
      return 'config-error'
    case 'insufficient_quota':
    case 'rate_limit_exceeded':
      return 'usage-limit'
  }
  if (status === 401) return 'auth-failed'
  if (status === 403) return 'not-eligible'
  if (status === 429) return 'usage-limit'
  if (status === 400 || status === 404) return 'unsupported'
  if (status >= 500) return 'temporarily-unavailable'
  return 'config-error'
}

/** 利用者の中止か、通信の失敗かを区別する */
export function fromFetchError(e: unknown, signal?: AbortSignal): AiError {
  if (e instanceof AiError) return e
  if (signal?.aborted) return new AiError('cancelled')
  return new AiError('network', e instanceof Error ? e.message : String(e))
}
