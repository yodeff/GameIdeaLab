// アイデアの全項目・メモ・操作（design/03 §1・§3）。モーダルと保存済み画面の右側で共用（T-22）
import { useEffect, useRef, useState } from 'react'
import { formatCombination } from '@core/export'
import { DISPLAY_FIELDS, FIELD_LABELS, MEMO_MAX, type IdeaRecord } from '@core/idea'
import { useIdeaActions } from '../app/useIdeaActions'
import { DeriveMenu } from './DeriveMenu'
import { CopyIcon, StarIcon } from './icons'

const MEMO_SAVE_DELAY_MS = 800

export function IdeaFields({ idea }: { idea: IdeaRecord }) {
  if (!idea.body) return <p className="idea-text">{idea.bodyText}</p>
  const body = idea.body
  return (
    <dl className="idea-fields">
      {DISPLAY_FIELDS.map((f) =>
        body[f] ? (
          <div key={f}>
            <dt>{FIELD_LABELS[f]}</dt>
            <dd>{body[f]}</dd>
          </div>
        ) : null
      )}
    </dl>
  )
}

/** メモ。入力が止まって少したつか、離れたときに保存する */
function MemoEditor({ idea, onSaved }: { idea: IdeaRecord; onSaved?: (idea: IdeaRecord) => void }) {
  const actions = useIdeaActions()
  const [value, setValue] = useState(idea.memo)
  const [state, setState] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const latest = useRef({ idea, value })
  latest.current = { idea, value }

  useEffect(() => {
    setValue(idea.memo)
    setState('saved')
  }, [idea.id]) // 別の案に切り替えたときだけ読み直す（保存のたびに入力中の文字を戻さない）

  const save = async () => {
    const { idea: current, value: text } = latest.current
    if (text === current.memo) {
      setState('saved')
      return
    }
    setState('saving')
    const next = await actions.update(current, { memo: text })
    setState('saved')
    if (next) onSaved?.(next)
  }

  useEffect(() => {
    if (state !== 'dirty') return
    const timer = setTimeout(() => void save(), MEMO_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  })

  // 閉じる・別の案に切り替えるときは、待たずに保存する（待ちのタイマーごと消えてメモを失わないように）
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  useEffect(
    () => () => {
      const { idea: current, value: text } = latest.current
      if (text !== current.memo) void actionsRef.current.update(current, { memo: text })
    },
    []
  )

  return (
    <div className="memo">
      <label className="hint" htmlFor={`memo-${idea.id}`}>
        メモ {state === 'dirty' ? '（未保存）' : state === 'saving' ? '（保存中…）' : ''}
      </label>
      <textarea
        id={`memo-${idea.id}`}
        value={value}
        maxLength={MEMO_MAX}
        placeholder="気づいたこと・次に試したいこと"
        onChange={(e) => {
          setValue(e.target.value)
          setState('dirty')
        }}
        onBlur={() => void save()}
      />
    </div>
  )
}

type ViewProps = {
  idea: IdeaRecord
  /** 更新・削除の後に一覧を読み直すなど */
  onChanged?: (idea: IdeaRecord) => void
  onRemoved?: () => void
  onDeriveStart?: () => void
}

export function IdeaDetailView({ idea, onChanged, onRemoved, onDeriveStart }: ViewProps) {
  const actions = useIdeaActions()
  const changed = (next: IdeaRecord | null) => {
    if (next) onChanged?.(next)
  }
  return (
    <div className="idea-detail">
      <header className="idea-detail-header">
        <div>
          <h2>{idea.title}</h2>
          <p className="hint">
            {formatCombination(idea.combination)}
            {idea.source === 'human' ? ' ・ 自分の案' : idea.direction ? ` ・ ${idea.direction}` : ''}
            {idea.derivation && ` ・ 派生: ${idea.derivation}`}
            {` ・ ${new Date(idea.createdAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}`}
          </p>
        </div>
        <button
          type="button"
          className={`ghost icon-only star${idea.favorite ? ' is-active' : ''}`}
          aria-pressed={idea.favorite}
          aria-label={idea.favorite ? 'お気に入りを外す' : 'お気に入りにする'}
          onClick={() => void actions.toggleFavorite(idea).then(changed)}
        >
          <StarIcon filled={idea.favorite} width={20} height={20} />
        </button>
      </header>
      <IdeaFields idea={idea} />
      <MemoEditor idea={idea} onSaved={changed} />
      <footer className="row idea-detail-actions">
        <button type="button" className={idea.saved ? 'is-active' : ''} onClick={() => void actions.toggleSaved(idea).then(changed)}>
          {idea.saved ? '履歴に戻す' : '保存'}
        </button>
        <button type="button" onClick={() => actions.copy([idea])}>
          <CopyIcon width={15} height={15} />
          コピー
        </button>
        <button type="button" onClick={() => void actions.exportFile([idea])}>
          Markdown で保存
        </button>
        {idea.body && <DeriveMenu idea={idea} disabled={false} {...(onDeriveStart ? { onStart: onDeriveStart } : {})} />}
        <span className="spacer" />
        <button type="button" className="ghost danger" onClick={() => void actions.remove(idea).then((ok) => ok && onRemoved?.())}>
          削除
        </button>
      </footer>
    </div>
  )
}

export function IdeaDetailModal({ idea, onClose }: { idea: IdeaRecord; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={idea.title}>
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose} aria-label="閉じる">
            閉じる
          </button>
        </div>
        <IdeaDetailView idea={idea} onRemoved={onClose} onDeriveStart={onClose} />
      </div>
    </div>
  )
}
