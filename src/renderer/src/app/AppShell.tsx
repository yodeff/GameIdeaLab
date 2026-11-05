// ヘッダーと画面の切り替え（design/03 §1）
import { useEffect } from 'react'
import { BackIcon, GearIcon } from '../components/icons'
import { PlanNoticeModal } from '../components/PlanNoticeModal'
import { MainScreen } from '../screens/MainScreen'
import { SavedScreen } from '../screens/SavedScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { configureSound } from '../sound/player'
import { isTrial } from '../api'
import { useActions, useAppState } from './AppContext'

const TOAST_MS = 2400

/** テーマ: system なら属性を外して prefers-color-scheme に任せる（D-22） */
function useTheme() {
  const { settings } = useAppState()
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset['theme']
    else root.dataset['theme'] = settings.theme
  }, [settings.theme])
}

/** 効果音の設定を音の部品に渡す */
function useSoundSettings() {
  const { settings } = useAppState()
  useEffect(() => configureSound(settings.sound, settings.soundVolume / 100), [settings.sound, settings.soundVolume])
}

function Toast() {
  const { toast } = useAppState()
  const actions = useActions()
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => actions.closeToast(toast.id), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast, actions])
  return toast ? (
    <div className="toast" role="status">
      {toast.message}
    </div>
  ) : null
}

export function AppShell() {
  const { workspace, screen } = useAppState()
  const actions = useActions()
  useTheme()
  useSoundSettings()

  return (
    <div className="app">
      <header className="app-header">
        {screen === 'main' ? (
          <h1>
            Game Idea Lab
            {isTrial && (
              <span className="trial-badge" title="ブラウザのお試し版。AI はデスクトップ版で使えます">
                お試し版
              </span>
            )}
          </h1>
        ) : (
          <button type="button" className="ghost" onClick={() => actions.setScreen('main')}>
            <BackIcon />
            メインに戻る
          </button>
        )}
        {screen === 'main' && (
          <div className="mode-switch" role="tablist" aria-label="発想モード">
            <button
              type="button"
              role="tab"
              aria-selected={workspace.mode === 'human'}
              onClick={() => actions.setMode('human')}
            >
              A 自分で考える
            </button>
            <button type="button" role="tab" aria-selected={workspace.mode === 'ai'} onClick={() => actions.setMode('ai')}>
              B AI に考えさせる
            </button>
          </div>
        )}
        <nav className="header-actions">
          <button
            type="button"
            className={`ghost${screen === 'saved' ? ' is-active' : ''}`}
            onClick={() => actions.setScreen(screen === 'saved' ? 'main' : 'saved')}
          >
            保存済み
          </button>
          <button
            type="button"
            className="ghost icon-only"
            aria-label="設定"
            title="設定"
            onClick={() => actions.setScreen('settings')}
          >
            <GearIcon />
          </button>
        </nav>
      </header>
      {screen === 'settings' ? <SettingsScreen /> : screen === 'saved' ? <SavedScreen /> : <MainScreen />}
      <PlanNoticeModal />
      <Toast />
    </div>
  )
}
