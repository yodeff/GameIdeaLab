import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

// 初期セットアップの画面。抽選・A/B モードは docs/ROADMAP.md の STEP 5 以降で作る
export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.gameIdeaLab?.getAppInfo().then(setInfo)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Game Idea Lab</h1>
        <span className="app-meta">
          {info ? `v${info.version} / ${info.platform}` : 'preload 未接続'}
        </span>
      </header>
      <main className="app-main">
        <div className="slots">
          <div className="slot">キーワード 1</div>
          <div className="slot">キーワード 2</div>
          <div className="slot">ゲームジャンル</div>
        </div>
        <p className="placeholder">初期セットアップ完了。抽選は STEP 5 で実装します。</p>
      </main>
    </div>
  )
}
