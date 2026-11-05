// 1 つのスロット（design/03 §2.2・§2.6）
import { useEffect, useRef, useState } from 'react'
import type { KeywordDictionary } from '@core/dictionary'
import { MANUAL_MAX_LENGTH, type SlotConfig, type SlotState } from '@core/draw'
import { CategoryPicker } from './CategoryPicker'
import { EditIcon, LockIcon, RerollIcon, UnlockIcon } from './icons'

type Props = {
  label: string
  shortcut: string
  index: number
  dictionary: KeywordDictionary
  state: SlotState
  config: SlotConfig
  roll: number
  onReroll: () => void
  onToggleLock: () => void
  onManual: (value: string) => void
  onCategories: (ids: string[]) => void
}

const ROLL_BASE_MS = 260
const ROLL_STAGGER_MS = 90
const ROLL_TICK_MS = 45

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 抽選の演出。結果は先に決まっていて、見た目だけ辞書の語を入れ替える。連打したら演出を飛ばす */
function useRollingText(value: string, roll: number, index: number, dictionary: KeywordDictionary): [string, boolean] {
  const [shown, setShown] = useState(value)
  const [rolling, setRolling] = useState(false)
  const lastRoll = useRef(roll)
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({})

  useEffect(() => {
    const clear = () => {
      clearInterval(timers.current.tick)
      clearTimeout(timers.current.stop)
    }
    if (roll === lastRoll.current) {
      setShown(value)
      return
    }
    const wasRolling = timers.current.tick !== undefined
    lastRoll.current = roll
    clear()
    timers.current = {}
    if (wasRolling || reducedMotion()) {
      setRolling(false)
      setShown(value)
      return
    }
    const words = dictionary.categories.flatMap((c) => c.words)
    setRolling(true)
    timers.current.tick = setInterval(() => {
      setShown(words[Math.floor(Math.random() * words.length)] ?? value)
    }, ROLL_TICK_MS)
    timers.current.stop = setTimeout(() => {
      clear()
      timers.current = {}
      setRolling(false)
      setShown(value)
    }, ROLL_BASE_MS + index * ROLL_STAGGER_MS)
    return undefined
  }, [roll, value, index, dictionary])

  useEffect(
    () => () => {
      clearInterval(timers.current.tick)
      clearTimeout(timers.current.stop)
    },
    []
  )
  return [shown, rolling]
}

export function SlotCard(props: Props) {
  const { label, shortcut, index, dictionary, state, config, roll } = props
  const [shown, rolling] = useRollingText(state.value, roll, index, dictionary)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  const startEdit = () => {
    setInput(state.value)
    setEditing(true)
  }
  const commit = () => {
    if (input.trim() !== '' && input.trim() !== state.value) props.onManual(input)
    setEditing(false)
  }

  return (
    <section className={`slot${state.locked ? ' is-locked' : ''}`} aria-label={label}>
      <header className="slot-header">
        <span className="slot-label">{label}</span>
        <CategoryPicker dictionary={dictionary} selected={config.categoryIds} onChange={props.onCategories} />
      </header>

      <div className="slot-value-area">
        {editing ? (
          <input
            className="slot-input"
            autoFocus
            value={input}
            maxLength={MANUAL_MAX_LENGTH}
            onChange={(e) => setInput(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            aria-label={`${label}を入力`}
          />
        ) : (
          <p className={`slot-value${rolling ? ' is-rolling' : ''}`} title={state.value} aria-live="polite">
            {shown}
          </p>
        )}
        {state.source === 'manual' && !editing && <span className="slot-badge">手動</span>}
      </div>

      <footer className="slot-actions">
        <button type="button" onClick={props.onReroll} title={`このスロットだけ引き直す（${shortcut}）`}>
          <RerollIcon />
          引き直す
        </button>
        <button
          type="button"
          className={state.locked ? 'is-active' : ''}
          aria-pressed={state.locked}
          onClick={props.onToggleLock}
          title={`一括抽選で変えない（Shift+${shortcut}）`}
        >
          {state.locked ? <LockIcon /> : <UnlockIcon />}
          {state.locked ? '固定中' : '固定'}
        </button>
        <button type="button" onClick={startEdit} title="自分で入力する（入力すると固定）">
          <EditIcon />
          入力
        </button>
      </footer>
    </section>
  )
}
