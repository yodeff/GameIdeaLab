// 保存済み画面（design/03 §3、T-22）。保存済みと履歴を切り替え、検索・絞り込み・複数選択の出力
import { useCallback, useEffect, useState } from 'react'
import { formatCombination } from '@core/export'
import type { IdeaListResult, IdeaScope } from '@core/idea'
import { api } from '../api'
import { useActions } from '../app/AppContext'
import { useIdeaActions } from '../app/useIdeaActions'
import { IdeaDetailView } from '../components/IdeaDetail'
import { StarIcon } from '../components/icons'

const LIMIT = 300
const SEARCH_DELAY_MS = 250

export function SavedScreen() {
  const app = useActions()
  const actions = useIdeaActions()
  const [scope, setScope] = useState<IdeaScope>('saved')
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [result, setResult] = useState<IdeaListResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  const reload = useCallback(async () => {
    const next = await api.listIdeas({ scope, text: query, genre, favoritesOnly, limit: LIMIT })
    setResult(next)
    setSelectedId((id) => (id && next.ideas.some((i) => i.id === id) ? id : (next.ideas[0]?.id ?? null)))
    setChecked((c) => new Set([...c].filter((id) => next.ideas.some((i) => i.id === id))))
  }, [scope, query, genre, favoritesOnly])

  useEffect(() => {
    void reload()
  }, [reload])

  const ideas = result?.ideas ?? []
  const selected = ideas.find((i) => i.id === selectedId) ?? null
  const checkedIdeas = ideas.filter((i) => checked.has(i.id))
  const toggleCheck = (id: string) =>
    setChecked((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <main className="saved-screen">
      <div className="saved-toolbar">
        <div className="mode-switch" role="tablist" aria-label="保存済みと履歴">
          {(
            [
              ['saved', '保存済み'],
              ['history', '履歴']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              onClick={() => {
                setScope(value)
                setGenre(null)
                setChecked(new Set())
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="text-input search"
          type="search"
          placeholder="検索（タイトル・キーワード・本文・メモ）"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select value={genre ?? ''} onChange={(e) => setGenre(e.target.value || null)} aria-label="ジャンル">
          <option value="">すべてのジャンル</option>
          {result?.genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <label className="row">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
          お気に入りだけ
        </label>
        <span className="spacer" />
        <span className="hint">
          {result ? `${result.total} 件${result.total > ideas.length ? `（新しい ${ideas.length} 件を表示）` : ''}` : '読み込み中…'}
        </span>
      </div>

      <div className="saved-body">
        <section className="saved-list" aria-label="一覧">
          {ideas.length === 0 && result && (
            <p className="hint empty">
              {scope === 'saved'
                ? 'まだ保存した案はありません。A モードで書いた案や、B モードのカードの「保存」「☆」がここに入ります。'
                : '履歴はまだありません。B モードで生成した案が、保存しなくても直近 200 件まで残ります。'}
            </p>
          )}
          <ul>
            {ideas.map((idea) => (
              <li key={idea.id} className={idea.id === selectedId ? 'is-selected' : ''}>
                <input type="checkbox" checked={checked.has(idea.id)} onChange={() => toggleCheck(idea.id)} aria-label={`${idea.title} を選ぶ`} />
                <button type="button" className="saved-item" onClick={() => setSelectedId(idea.id)}>
                  <span className="saved-item-title">
                    {idea.favorite && <StarIcon filled width={13} height={13} className="star is-active" />}
                    {idea.source === 'human' && <span className="badge">A</span>}
                    {idea.title}
                  </span>
                  <span className="hint">{formatCombination(idea.combination)}</span>
                </button>
              </li>
            ))}
          </ul>
          <footer className="saved-list-footer">
            <span className="hint">{checked.size > 0 ? `${checked.size} 件を選択中` : 'チェックで複数をまとめて出力'}</span>
            <button type="button" disabled={checkedIdeas.length === 0} onClick={() => actions.copy(checkedIdeas)}>
              まとめてコピー
            </button>
            <button type="button" disabled={checkedIdeas.length === 0} onClick={() => void actions.exportFile(checkedIdeas)}>
              まとめて Markdown で保存
            </button>
          </footer>
        </section>

        <section className="saved-detail" aria-label="詳細">
          {selected ? (
            <IdeaDetailView
              key={selected.id}
              idea={selected}
              onChanged={() => void reload()}
              onRemoved={() => void reload()}
              onDeriveStart={() => {
                app.setMode('ai')
                app.setScreen('main')
              }}
            />
          ) : (
            <p className="hint empty">左の一覧から案を選んでください。</p>
          )}
        </section>
      </div>
    </main>
  )
}

