// 設定画面（design/03 §4）。STEP 5 では見た目だけ。AI の接続・生成の既定値は T-17 で足す
import type { Theme } from '@core/settings'
import { useActions, useAppState } from '../app/AppContext'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'システムに合わせる' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' }
]

export function SettingsScreen() {
  const { settings } = useAppState()
  const actions = useActions()

  return (
    <main className="settings-screen">
      <h2>設定</h2>
      <section className="settings-section">
        <h3>見た目</h3>
        <div className="radio-row" role="radiogroup" aria-label="テーマ">
          {THEMES.map((t) => (
            <label key={t.value}>
              <input
                type="radio"
                name="theme"
                checked={settings.theme === t.value}
                onChange={() => void actions.updateSettings({ theme: t.value })}
              />
              {t.label}
            </label>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h3>AI の接続</h3>
        <p className="hint">Sign in with ChatGPT と API キーの設定は次の段階（STEP 6）で追加します。</p>
      </section>
    </main>
  )
}
