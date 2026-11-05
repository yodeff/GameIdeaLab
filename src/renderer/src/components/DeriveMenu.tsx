// 派生の操作（Q-5、企画書 §8.2、design/04 §3.4）。別のジャンルは辞書から今と違うものを引き、選び直せる
import { useEffect, useRef, useState } from 'react'
import { DERIVE_INSTRUCTION_MAX, DERIVE_LABELS, type DeriveOperation, type IdeaRecord } from '@core/idea'
import { useAiActions } from '../app/AiContext'
import { dictionaries } from '../app/dictionaries'
import { ChevronIcon } from './icons'

const genres = dictionaries.genre.categories.flatMap((c) => c.words)

function otherGenre(current: string): string {
  const others = genres.filter((g) => g !== current)
  return others[Math.floor(Math.random() * others.length)] ?? current
}

export function DeriveMenu({ idea, disabled, onStart }: { idea: IdeaRecord; disabled: boolean; onStart?: () => void }) {
  const ai = useAiActions()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'menu' | 'genre' | 'free'>('menu')
  const [genre, setGenre] = useState(() => otherGenre(idea.combination.genre))
  const [instruction, setInstruction] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const run = (operation: DeriveOperation, extra?: { genre?: string; instruction?: string }) => {
    setOpen(false)
    setMode('menu')
    onStart?.()
    void ai.derive(idea, operation, extra)
  }

  return (
    <div className="derive-menu" ref={root}>
      <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        派生
        <ChevronIcon />
      </button>
      {open && (
        <div className="popover derive-popover">
          {mode === 'menu' && (
            <>
              {(['original', 'gameplay', 'simpler'] as const).map((op) => (
                <button key={op} type="button" className="ghost menu-item" onClick={() => run(op)}>
                  {DERIVE_LABELS[op]}
                </button>
              ))}
              <button type="button" className="ghost menu-item" onClick={() => setMode('genre')}>
                {DERIVE_LABELS.genre}
              </button>
              <button type="button" className="ghost menu-item" onClick={() => setMode('free')}>
                {DERIVE_LABELS.free}
              </button>
            </>
          )}
          {mode === 'genre' && (
            <div className="derive-form">
              <label className="hint" htmlFor={`genre-${idea.id}`}>
                新しいジャンル
              </label>
              <select id={`genre-${idea.id}`} value={genre} onChange={(e) => setGenre(e.target.value)}>
                {genres
                  .filter((g) => g !== idea.combination.genre)
                  .map((g) => (
                    <option key={g}>{g}</option>
                  ))}
              </select>
              <button type="button" className="primary" onClick={() => run('genre', { genre })}>
                このジャンルで派生
              </button>
            </div>
          )}
          {mode === 'free' && (
            <div className="derive-form">
              <textarea
                autoFocus
                value={instruction}
                maxLength={DERIVE_INSTRUCTION_MAX}
                placeholder="例: 2 人で協力するゲームにする"
                onChange={(e) => setInstruction(e.target.value)}
              />
              <button type="button" className="primary" disabled={!instruction.trim()} onClick={() => run('free', { instruction })}>
                この指示で派生
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
