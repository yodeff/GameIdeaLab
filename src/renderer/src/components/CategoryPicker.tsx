// カテゴリの複数選択（design/03 §2.2）。何も選ばなければ「すべて」（D-1）
import { useEffect, useId, useRef, useState } from 'react'
import type { KeywordDictionary } from '@core/dictionary'
import { ChevronIcon } from './icons'

type Props = {
  dictionary: KeywordDictionary
  selected: string[]
  onChange: (ids: string[]) => void
}

export function categorySummary(dictionary: KeywordDictionary, selected: string[]): string {
  const labels = dictionary.categories.filter((c) => selected.includes(c.id)).map((c) => c.label)
  if (labels.length === 0) return 'すべて'
  return labels.length === 1 ? (labels[0] ?? '') : `${labels[0]} ほか ${labels.length - 1}`
}

export function CategoryPicker({ dictionary, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <div className="category-picker" ref={root}>
      <button
        type="button"
        className="category-trigger"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        title="抽選するカテゴリを選ぶ"
      >
        <span>{categorySummary(dictionary, selected)}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="category-popover" id={listId} role="group" aria-label="カテゴリ">
          <label className="category-option">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            すべて
          </label>
          <hr />
          {dictionary.categories.map((c) => (
            <label key={c.id} className="category-option">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
              {c.label}
              <span className="category-count">{c.words.length}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
