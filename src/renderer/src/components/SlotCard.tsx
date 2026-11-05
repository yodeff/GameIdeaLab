// 1 つのスロット（design/03 §2.2・§2.6）
import { useEffect, useRef, useState } from 'react'
import type { KeywordDictionary } from '@core/dictionary'
import { MANUAL_MAX_LENGTH, type Slot } from '@core/draw'
import { rollCues } from '../sound/player'
import { CategoryPicker } from './CategoryPicker'
import { CloseIcon, EditIcon, LockIcon, RerollIcon, UnlockIcon } from './icons'

type Props = {
  label: string
  /** 引き直しのキー（1〜9）。10 個目以降は無し */
  shortcut: string | null
  index: number
  dictionary: KeywordDictionary
  slot: Slot
  roll: number
  /** 外せないとき（下限）は undefined */
  onRemove?: (() => void) | undefined
  onReroll: () => void
  onToggleLock: () => void
  onManual: (value: string) => void
  onCategories: (ids: string[]) => void
}

const ROLL_BASE_MS = 260
const ROLL_STAGGER_MS = 90
const ROLL_TICK_MS = 45

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 抽選の演出。結果は先に決まっていて、見た目だけ辞書の語を入れ替える。連打したら演出を飛ばす。音は rollCues に任せる */
function useRollingText(value: string, roll: number, index: number, dictionary: KeywordDictionary): [string, boolean] {
  const [shown, setShown] = useState(value)
  const [rolling, setRolling] = useState(false)
  const lastRoll = useRef(roll)
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({})
  /** このスロットが回っている間 true（音の数を合わせるため） */
  const sounding = useRef(false)
  const endSound = (stopped: boolean) => {
    if (!sounding.current) return
    sounding.current = false
    rollCues.end(stopped)
  }

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
      if (wasRolling) endSound(true)
      else rollCues.instant()
      return
    }
    const words = dictionary.categories.flatMap((c) => c.words)
    setRolling(true)
    sounding.current = true
    rollCues.start()
    timers.current.tick = setInterval(() => {
      setShown(words[Math.floor(Math.random() * words.length)] ?? value)
    }, ROLL_TICK_MS)
    timers.current.stop = setTimeout(() => {
      clear()
      timers.current = {}
      setRolling(false)
      setShown(value)
      endSound(true)
    }, ROLL_BASE_MS + index * ROLL_STAGGER_MS)
    return undefined
  }, [roll, value, index, dictionary])

  useEffect(
    () => () => {
      clearInterval(timers.current.tick)
      clearTimeout(timers.current.stop)
      endSound(false) // 回っている途中で外されたら、音の数だけ戻す
    },
    []
  )
  return [shown, rolling]
}

export function SlotCard(props: Props) {
  const { label, shortcut, index, dictionary, slot: state, roll } = props
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
    <section className={`slot is-${state.kind}${state.locked ? ' is-locked' : ''}`} aria-label={label}>
      <header className="slot-header">
        <span className="slot-label">{label}</span>
        <span className="slot-header-actions">
          <CategoryPicker dictionary={dictionary} selected={state.categoryIds} onChange={props.onCategories} />
          {props.onRemove && (
            <button type="button" className="ghost icon-only slot-remove" onClick={props.onRemove} aria-label={`${label}を外す`} title="このスロットを外す">
              <CloseIcon width={14} height={14} />
            </button>
          )}
        </span>
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
        <button
          type="button"
          onClick={props.onReroll}
          aria-label="引き直す"
          title={shortcut ? `このスロットだけ引き直す（${shortcut}）` : 'このスロットだけ引き直す'}
        >
          <RerollIcon />
          <span className="slot-action-label">引き直す</span>
        </button>
        <button
          type="button"
          className={state.locked ? 'is-active' : ''}
          aria-pressed={state.locked}
          aria-label="固定"
          onClick={props.onToggleLock}
          title={shortcut ? `一括抽選で変えない（Shift+${shortcut}）` : '一括抽選で変えない'}
        >
          {state.locked ? <LockIcon /> : <UnlockIcon />}
          <span className="slot-action-label">{state.locked ? '固定中' : '固定'}</span>
        </button>
        <button type="button" onClick={startEdit} aria-label="入力" title="自分で入力する（入力すると固定）">
          <EditIcon />
          <span className="slot-action-label">入力</span>
        </button>
      </footer>
    </section>
  )
}
