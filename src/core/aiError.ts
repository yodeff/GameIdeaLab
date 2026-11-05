// AI の生成・接続の誤りの区別（design/02 §5、design/03 §5、調査 §6）。画面の文言もここに置く。

export const AI_ERROR_KINDS = [
  'not-signed-in',
  'plan-not-granted',
  'not-eligible',
  'usage-limit',
  'temporarily-unavailable',
  'network',
  'unsupported',
  'auth-failed',
  'config-error',
  'incomplete',
  'invalid-output',
  'cancelled',
  'busy'
] as const

export type AiErrorKind = (typeof AI_ERROR_KINDS)[number]

export type AiErrorInfo = {
  kind: AiErrorKind
  /** 利用者向けの 1 文 */
  message: string
  /** 調べるための情報（公式の誤りのコードなど）。トークンを入れない */
  detail?: string
}

export const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  'not-signed-in': 'B モードには AI の接続が必要です。',
  'plan-not-granted': 'ChatGPT プランの利用が許可されていません。',
  'not-eligible': 'このアカウントでは ChatGPT プランを使えません（対象は Plus・Pro）。',
  'usage-limit': 'ChatGPT プランの利用量の上限に達しました。',
  'temporarily-unavailable': 'AI が一時的に使えません。少し待ってからもう一度試してください。',
  network: 'AI に接続できませんでした。ネットワークを確かめてください。',
  unsupported: 'このモデルや指定は、今の接続では使えません。設定でモデルを変えてください。',
  'auth-failed': '認証が切れたか、接続が解除されました。もう一度サインインしてください。',
  'config-error': 'アプリの設定の誤りで生成できませんでした。',
  incomplete: '生成が途中で終わりました。',
  'invalid-output': 'AI の出力を読み取れませんでした。もう一度試してください。',
  cancelled: '生成を中止しました。',
  busy: '別の生成が進んでいます。'
}

export function aiErrorInfo(kind: AiErrorKind, detail?: string): AiErrorInfo {
  return detail ? { kind, message: AI_ERROR_MESSAGES[kind], detail } : { kind, message: AI_ERROR_MESSAGES[kind] }
}
