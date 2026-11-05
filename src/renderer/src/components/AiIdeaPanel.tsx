// B モード（design/03 §2.4・§5）
import { useEffect, useState } from 'react'
import type { AiErrorInfo } from '@core/aiError'
import { formatCombination } from '@core/export'
import { AI_COUNT_MAX, AI_COUNT_MIN, type Fidelity } from '@core/settings'
import { isConnected, useAi, useAiActions } from '../app/AiContext'
import { useActions, useAppState } from '../app/AppContext'
import { IdeaDetailModal } from './IdeaDetail'
import { IdeaCard, SkeletonCard } from './IdeaCard'
import { ModelSelect, ReasoningSelect } from './ModelControls'

const FIDELITY_LABELS: Record<Fidelity, string> = { strict: '厳格', standard: '標準', free: '自由' }

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span>{Math.max(0, Math.round((now - since) / 1000))} 秒</span>
}

export function PlanBadge() {
  const ai = useAi()
  const actions = useAiActions()
  const { settings } = useAppState()
  if (settings.aiConnection !== 'chatgpt' || !ai.auth?.chatgpt.planUsage) return null
  return (
    <span className="plan-badge">
      Using ChatGPT plan ・
      <button type="button" className="link" onClick={actions.openManageUsage}>
        Manage usage
      </button>
    </span>
  )
}

function ConnectPrompt() {
  const ai = useAi()
  const actions = useAiActions()
  const app = useActions()
  return (
    <div className="connect-prompt">
      <p>B モードには AI の接続が必要です。抽選と A モードはこのまま使えます。</p>
      <div className="row">
        <button type="button" className="primary" disabled={ai.signingIn} onClick={() => void actions.signIn()}>
          {ai.signingIn ? 'ブラウザでサインインしてください…' : 'Continue with ChatGPT'}
        </button>
        {ai.signingIn && (
          <button type="button" className="ghost" onClick={actions.cancelSignIn}>
            中止
          </button>
        )}
        <button type="button" className="ghost" onClick={() => app.setScreen('settings')}>
          設定を開く（API キー）
        </button>
      </div>
      <p className="hint">ChatGPT の Plus・Pro のプランで生成できます。API キーは入力しません。</p>
    </div>
  )
}

function ErrorBanner({ error }: { error: AiErrorInfo }) {
  const actions = useAiActions()
  const app = useActions()
  const retry = (
    <button type="button" onClick={() => void actions.generate()}>
      もう一度
    </button>
  )
  const action = (() => {
    switch (error.kind) {
      case 'plan-not-granted':
      case 'auth-failed':
        return (
          <button type="button" className="primary" onClick={() => void actions.signIn()}>
            {error.kind === 'auth-failed' ? 'サインインし直す' : 'もう一度許可する'}
          </button>
        )
      case 'usage-limit':
        return (
          <button type="button" className="primary" onClick={actions.openManageUsage}>
            Manage usage
          </button>
        )
      case 'not-eligible':
      case 'unsupported':
        return (
          <button type="button" onClick={() => app.setScreen('settings')}>
            設定を開く
          </button>
        )
      case 'temporarily-unavailable':
      case 'network':
      case 'incomplete':
      case 'invalid-output':
        return retry
      case 'config-error':
        return (
          <button type="button" onClick={() => void navigator.clipboard.writeText(`${error.kind}: ${error.detail ?? ''}`)}>
            詳細をコピー
          </button>
        )
      default:
        return null
    }
  })()
  return (
    <div className={`error-banner${error.kind === 'cancelled' ? ' is-info' : ''}`} role="alert">
      <span>{error.message}</span>
      {error.detail && error.kind !== 'cancelled' && <span className="hint">{error.detail}</span>}
      <span className="spacer" />
      {action}
      <button type="button" className="ghost" onClick={actions.dismissError} aria-label="閉じる">
        ×
      </button>
    </div>
  )
}

export function AiIdeaPanel() {
  const ai = useAi()
  const actions = useAiActions()
  const { settings } = useAppState()
  const app = useActions()
  const [detailId, setDetailId] = useState<string | null>(null)
  const detail = ai.results.find((r) => r.id === detailId) ?? null
  const connected = isConnected(ai.auth, settings.aiConnection)
  const running = ai.job !== null
  const pending = ai.job ? Math.max(0, ai.job.total - ai.job.received) : 0
  const titleOf = (id: string | null) => ai.results.find((r) => r.id === id)?.title ?? null

  return (
    <section className="panel ai-panel" aria-label="AI に考えさせる">
      <div className="ai-toolbar">
        <button
          type="button"
          className="primary generate-button"
          disabled={running || ai.auth === null}
          onClick={() => void actions.generate()}
          title="Ctrl+Enter"
        >
          ✦ {settings.aiCount} 案を生成
        </button>
        <label className="hint">
          案の数
          <select value={settings.aiCount} onChange={(e) => void app.updateSettings({ aiCount: Number(e.target.value) })}>
            {Array.from({ length: AI_COUNT_MAX - AI_COUNT_MIN + 1 }, (_, i) => i + AI_COUNT_MIN).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="hint">
          キーワードへの忠実度
          <select value={settings.aiFidelity} onChange={(e) => void app.updateSettings({ aiFidelity: e.target.value as Fidelity })}>
            {(Object.keys(FIDELITY_LABELS) as Fidelity[]).map((f) => (
              <option key={f} value={f}>
                {FIDELITY_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="hint">
          モデル
          <ModelSelect />
        </label>
        <label className="hint">
          考える深さ
          <ReasoningSelect />
        </label>
        <span className="spacer" />
        {running && (
          <span className="hint generating">
            生成中… <Elapsed since={ai.job?.startedAt ?? Date.now()} />
            <button type="button" className="ghost" onClick={actions.cancel}>
              中止
            </button>
          </span>
        )}
        <PlanBadge />
      </div>

      {ai.error && !(ai.error.kind === 'not-signed-in' && !connected) && <ErrorBanner error={ai.error} />}
      {!connected && ai.auth !== null && !running && ai.results.length === 0 && <ConnectPrompt />}
      {ai.shortfall && (
        <div className="error-banner is-info" role="status">
          <span>
            {ai.shortfall.requested} 案のうち {ai.shortfall.received} 案が届きました。残りの {ai.shortfall.requested - ai.shortfall.received} 案は、やり直しても読める形で届きませんでした。
          </span>
        </div>
      )}

      {(ai.results.length > 0 || running) && (
        <>
          {ai.resultCombination && (
            <p className="hint result-caption">
              {formatCombination(ai.resultCombination)} で生成
              {ai.resultAt && `（${new Date(ai.resultAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`}
            </p>
          )}
          <div className="idea-grid">
            {ai.results.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} parentTitle={titleOf(idea.parentId)} busy={running} onDetail={() => setDetailId(idea.id)} />
            ))}
            {Array.from({ length: pending }, (_, i) => (
              <SkeletonCard key={`s-${i}`} />
            ))}
          </div>
        </>
      )}
      {connected && !running && ai.results.length === 0 && !ai.error && (
        <p className="hint empty">組み合わせを決めて「生成」を押すと、{settings.aiCount} 案が届きます（1 案あたり十数秒）。</p>
      )}
      {detail && <IdeaDetailModal idea={detail} onClose={() => setDetailId(null)} />}
    </section>
  )
}
