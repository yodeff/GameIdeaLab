// 1 案の要約（design/03 §2.4）。お気に入り・保存・コピー・詳細・派生（T-23）
import type { IdeaRecord } from '@core/idea'
import { useIdeaActions } from '../app/useIdeaActions'
import { DeriveMenu } from './DeriveMenu'
import { CopyIcon, StarIcon } from './icons'

type Props = {
  idea: IdeaRecord
  parentTitle: string | null
  busy: boolean
  onDetail: () => void
}

export function IdeaCard({ idea, parentTitle, busy, onDetail }: Props) {
  const actions = useIdeaActions()
  return (
    <article className={`idea-card${idea.parentId ? ' is-derived' : ''}`}>
      <header className="idea-card-header">
        {idea.direction && <span className={`badge direction-${idea.direction}`}>{idea.direction}</span>}
        {idea.parentId && (
          <span className="hint derived-from" title={idea.derivation ?? ''}>
            ← {parentTitle ?? '元の案'} から（{idea.derivation}）
          </span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className={`ghost icon-only star${idea.favorite ? ' is-active' : ''}`}
          aria-pressed={idea.favorite}
          aria-label={idea.favorite ? 'お気に入りを外す' : 'お気に入りにする'}
          title={idea.favorite ? 'お気に入りを外す' : 'お気に入り（保存もする）'}
          onClick={() => void actions.toggleFavorite(idea)}
        >
          <StarIcon filled={idea.favorite} />
        </button>
      </header>
      <h3>{idea.title}</h3>
      <p className="idea-concept">{idea.concept}</p>
      {idea.body && (
        <p className="idea-loop">
          <span className="hint">{idea.body.risk_return ? 'リスクとリターン' : 'コアループ'}</span>
          {idea.body.risk_return || idea.body.core_loop}
        </p>
      )}
      <footer className="idea-card-actions">
        <button type="button" className={idea.saved ? 'is-active' : ''} aria-pressed={idea.saved} onClick={() => void actions.toggleSaved(idea)}>
          {idea.saved ? '保存済み' : '保存'}
        </button>
        <button type="button" onClick={() => actions.copy([idea])} title="Markdown でコピー">
          <CopyIcon width={15} height={15} />
          コピー
        </button>
        <button type="button" onClick={onDetail}>
          詳細
        </button>
        <DeriveMenu idea={idea} disabled={busy} />
      </footer>
    </article>
  )
}

export function SkeletonCard() {
  return (
    <article className="idea-card is-skeleton" aria-hidden="true">
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </article>
  )
}
