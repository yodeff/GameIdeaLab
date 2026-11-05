// アイデアの全項目（design/03 §1・§3）。モーダルで出す。メモの編集は STEP 7（T-22）で足す
import { useEffect } from 'react'
import { formatCombination } from '@core/export'
import { FIELD_LABELS, OPTIONAL_FIELDS, REQUIRED_FIELDS, type IdeaRecord } from '@core/idea'

export function IdeaFields({ idea }: { idea: IdeaRecord }) {
  if (!idea.body) return <p className="idea-text">{idea.bodyText}</p>
  const body = idea.body
  return (
    <dl className="idea-fields">
      {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((f) =>
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
        <header className="modal-header">
          <div>
            <h2>{idea.title}</h2>
            <p className="hint">
              {formatCombination(idea.combination)}
              {idea.direction && ` ・ ${idea.direction}`}
              {idea.derivation && ` ・ 派生: ${idea.derivation}`}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="閉じる">
            閉じる
          </button>
        </header>
        <IdeaFields idea={idea} />
      </div>
    </div>
  )
}
