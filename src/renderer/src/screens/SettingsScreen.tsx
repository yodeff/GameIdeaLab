// 設定画面（design/03 §4）
import { useEffect, useState } from 'react'
import { AI_COUNT_MAX, AI_COUNT_MIN, type AiConnection, type Fidelity, type Theme } from '@core/settings'
import { useAi, useAiActions } from '../app/AiContext'
import { useActions, useAppState } from '../app/AppContext'
import { PlanBadge } from '../components/AiIdeaPanel'
import { ModelSelect, ReasoningSelect } from '../components/ModelControls'
import { sounds } from '../sound/player'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'システムに合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' }
]

const FIDELITIES: { value: Fidelity; label: string; hint: string }[] = [
  { value: 'strict', label: '厳格', hint: '両方のキーワードをメカニクスの中心に' },
  { value: 'standard', label: '標準', hint: '少なくとも片方をメカニクスに' },
  { value: 'free', label: '自由', hint: '連想した概念への飛躍を許す' }
]

function ChatGptSection() {
  const ai = useAi()
  const actions = useAiActions()
  const chatgpt = ai.auth?.chatgpt
  if (!chatgpt) return <p className="hint">読み込み中…</p>

  if (!chatgpt.signedIn) {
    return (
      <div className="stack">
        <p className="hint">ChatGPT のアカウント（Plus・Pro）でサインインすると、そのプランで案を生成できます。API キーは入力しません。</p>
        <div className="row">
          <button type="button" className="primary" disabled={ai.signingIn} onClick={() => void actions.signIn()}>
            {ai.signingIn ? 'ブラウザでサインインしてください…' : 'Continue with ChatGPT'}
          </button>
          {ai.signingIn && (
            <button type="button" className="ghost" onClick={actions.cancelSignIn}>
              中止
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="stack">
      <p>
        <strong>{chatgpt.account?.name ?? 'ChatGPT のアカウント'}</strong>
        {chatgpt.account?.email && <span className="hint"> （{chatgpt.account.email}）</span>}
      </p>
      {chatgpt.planUsage ? (
        <PlanBadge />
      ) : (
        <div className="row">
          <span className="hint">ChatGPT プランの利用が許可されていません。</span>
          <button type="button" onClick={() => void actions.signIn()}>
            もう一度許可する
          </button>
        </div>
      )}
      <div className="row">
        <button type="button" onClick={() => void actions.signOut()}>
          サインアウト
        </button>
      </div>
    </div>
  )
}

function ApiKeySection() {
  const ai = useAi()
  const actions = useAiActions()
  const apiKey = ai.auth?.apiKey
  const [enabled, setEnabled] = useState(false)
  const [value, setValue] = useState('')
  if (!apiKey) return null

  if (apiKey.configured) {
    return (
      <div className="row">
        <span>保存済みの API キー: sk-…{apiKey.last4}</span>
        <button type="button" onClick={() => void actions.clearApiKey()}>
          削除
        </button>
      </div>
    )
  }
  return (
    <div className="stack">
      <label className="row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        自分の OpenAI API キーを使う（利用料はあなたの OpenAI アカウントに課金されます）
      </label>
      {enabled && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void actions.setApiKey(value).then((ok) => ok && setValue(''))
          }}
        >
          <input
            type="password"
            className="text-input"
            placeholder="sk-..."
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!value.trim()}>
            保存
          </button>
        </form>
      )}
    </div>
  )
}

export function SettingsScreen() {
  const { settings } = useAppState()
  const app = useActions()
  const ai = useAi()
  const aiActions = useAiActions()
  const auth = ai.auth
  const canUse: Record<AiConnection, boolean> = {
    chatgpt: auth?.chatgpt.signedIn ?? false,
    apiKey: auth?.apiKey.configured ?? false
  }
  const connected = canUse[settings.aiConnection]
  const selectedModel = ai.models?.find((m) => m.id === (settings.aiModel ?? 'gpt-6.1-sol'))

  useEffect(() => {
    if (connected) void aiActions.loadModels()
    // 接続が変わったときだけ読み直す（loadModels は毎回作り直されるので依存に入れない）
  }, [connected, settings.aiConnection])

  return (
    <main className="settings-screen">
      <h2>設定</h2>

      <section className="settings-section">
        <h3>AI の接続</h3>
        {auth && !auth.encryptionAvailable && (
          <p className="error-banner">この環境では秘密の情報を安全に保存できないため、サインインと API キーは使えません。</p>
        )}
        <h4>ChatGPT</h4>
        <ChatGptSection />
        <h4>API キー</h4>
        <ApiKeySection />
        <h4>使う接続</h4>
        <div className="radio-row" role="radiogroup" aria-label="使う接続">
          {(
            [
              ['chatgpt', 'ChatGPT プラン'],
              ['apiKey', 'API キー']
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="connection"
                checked={settings.aiConnection === value}
                onChange={() => void app.updateSettings({ aiConnection: value })}
              />
              {label}
              {!canUse[value] && <span className="hint">（未設定）</span>}
            </label>
          ))}
        </div>
        <p className="hint">使えない接続に自動で切り替えることはありません。</p>
      </section>

      <section className="settings-section">
        <h3>生成</h3>
        <div className="form-grid">
          <label htmlFor="model">モデル</label>
          <div className="row">
            <ModelSelect id="model" />
            {!connected && <span className="hint">接続するとモデルの一覧が出ます</span>}
            {ai.modelsError && <span className="hint">一覧を取れませんでした（{ai.modelsError.message}）</span>}
            {selectedModel?.description && <span className="hint">{selectedModel.description}</span>}
          </div>

          <label htmlFor="reasoning">考える深さ</label>
          <div className="row">
            <ReasoningSelect id="reasoning" />
            <span className="hint">浅いほど早く届き、利用量も少なくなります。深いほど時間と利用量が増えます（fast モードとは別のもので、fast モードは使いません）</span>
          </div>

          <label htmlFor="count">案の数の既定</label>
          <select id="count" value={settings.aiCount} onChange={(e) => void app.updateSettings({ aiCount: Number(e.target.value) })}>
            {Array.from({ length: AI_COUNT_MAX - AI_COUNT_MIN + 1 }, (_, i) => i + AI_COUNT_MIN).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <span>キーワードへの忠実度</span>
          <div className="radio-row" role="radiogroup" aria-label="キーワードへの忠実度">
            {FIDELITIES.map((f) => (
              <label key={f.value} title={f.hint}>
                <input
                  type="radio"
                  name="fidelity"
                  checked={settings.aiFidelity === f.value}
                  onChange={() => void app.updateSettings({ aiFidelity: f.value })}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>音</h3>
        <div className="form-grid">
          <span>効果音</span>
          <label className="row">
            <input type="checkbox" checked={settings.sound} onChange={(e) => void app.updateSettings({ sound: e.target.checked })} />
            抽選中・組み合わせが決まったとき・案が出そろったときに鳴らす
          </label>

          <label htmlFor="sound-volume">音量</label>
          <div className="row">
            <input
              id="sound-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.soundVolume}
              disabled={!settings.sound}
              onChange={(e) => void app.updateSettings({ soundVolume: Number(e.target.value) })}
            />
            <span className="hint sound-volume-value">{settings.soundVolume}</span>
            <button type="button" className="ghost" disabled={!settings.sound} onClick={() => sounds.complete()}>
              試しに鳴らす
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>見た目</h3>
        <div className="radio-row" role="radiogroup" aria-label="テーマ">
          {THEMES.map((t) => (
            <label key={t.value}>
              <input type="radio" name="theme" checked={settings.theme === t.value} onChange={() => void app.updateSettings({ theme: t.value })} />
              {t.label}
            </label>
          ))}
        </div>
      </section>
    </main>
  )
}
