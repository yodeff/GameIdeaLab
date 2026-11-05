// A モード（design/03 §2.3）。下書きは作業状態として自動保存する（D-9・D-10）
import { useState } from 'react'
import { combinationOf, sameCombination } from '@core/draw'
import { formatCombination } from '@core/export'
import { IDEA_TITLE_MAX } from '@core/idea'
import { DRAFT_BODY_MAX, emptyDraft } from '@core/workspace'
import { api } from '../api'
import { useActions, useAppState } from '../app/AppContext'


export function HumanIdeaPanel() {
  const { workspace } = useAppState()
  const actions = useActions()
  const { draft } = workspace
  const current = combinationOf(workspace.draw)
  const started = draft.startedWith
  const changed = started !== null && !sameCombination(started, current)
  const [useStarted, setUseStarted] = useState(false)
  const [saving, setSaving] = useState(false)

  const update = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() }
    // 書き始めた瞬間の組み合わせを覚える。空に戻したら忘れる
    if (next.body.trim() === '' && next.title.trim() === '') next.startedWith = null
    else if (next.startedWith === null) next.startedWith = current
    actions.setDraft(next)
  }

  const save = async () => {
    if (draft.body.trim() === '' || saving) return
    setSaving(true)
    try {
      const combination = changed && useStarted && started ? started : current
      await api.saveHumanIdea({ title: draft.title, body: draft.body, combination })
      actions.setDraft(emptyDraft(new Date().toISOString()))
      setUseStarted(false)
      actions.toast('保存しました')
    } catch (e) {
      console.error(e)
      actions.toast('保存できませんでした')
    } finally {
      setSaving(false)
    }
  }

  const clear = () => {
    if (draft.body.trim() !== '' && !window.confirm('下書きを消しますか？')) return
    actions.setDraft(emptyDraft(new Date().toISOString()))
  }

  return (
    <section className="panel human-panel" aria-label="自分で考える">
      <header className="panel-header">
        <h2>この組み合わせでどんなゲーム？</h2>
        {changed && started && (
          <span className="started-with" title="下書きを書き始めたときの組み合わせ">
            書き始め: {formatCombination(started)}
          </span>
        )}
      </header>
      <input
        className="draft-title"
        placeholder="タイトル（任意）"
        value={draft.title}
        maxLength={IDEA_TITLE_MAX}
        onChange={(e) => update({ title: e.target.value })}
      />
      <textarea
        className="draft-body"
        placeholder="プレイヤーは何をする？　何が面白い？　自由に書いてください"
        value={draft.body}
        maxLength={DRAFT_BODY_MAX}
        onChange={(e) => update({ body: e.target.value })}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault()
            void save()
          }
        }}
      />
      <footer className="panel-footer">
        <span className="hint">{draft.body ? '自動保存済み' : 'AI の案は表示しません。思いつくまま書いてください'}</span>
        {changed && (
          <label className="hint">
            <input type="checkbox" checked={useStarted} onChange={(e) => setUseStarted(e.target.checked)} />
            書き始めの組み合わせで保存する
          </label>
        )}
        <button type="button" className="secondary" onClick={clear} disabled={!draft.body && !draft.title}>
          消す
        </button>
        <button type="button" className="primary" onClick={() => void save()} disabled={!draft.body.trim() || saving}>
          保存（Ctrl+S）
        </button>
      </footer>
    </section>
  )
}
