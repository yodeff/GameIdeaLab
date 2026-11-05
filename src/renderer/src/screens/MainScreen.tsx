// メイン画面（design/03 §2）
import { useEffect } from 'react'
import { SLOT_LIMITS, dictionaryFor, slotsOf, type Slot, type SlotKind } from '@core/draw'
import { useAiActions } from '../app/AiContext'
import { useActions, useAppState } from '../app/AppContext'
import { dictionaries } from '../app/dictionaries'
import { AiIdeaPanel } from '../components/AiIdeaPanel'
import { HumanIdeaPanel } from '../components/HumanIdeaPanel'
import { CopyIcon, PlusIcon, SpinIcon } from '../components/icons'
import { SlotCard } from '../components/SlotCard'
import { primaryMod, shortcut } from '../keys'

const KIND_LABELS: Record<SlotKind, string> = { genre: 'ジャンル', keyword: 'キーワード' }

/** 1〜9 のキーで左から順にスロットを引き直す（Shift で固定） */
const shortcutOf = (index: number) => (index < 9 ? String(index + 1) : null)

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** キー操作（design/03 §2.5）。入力欄にいるときは抽選しない */
function useShortcuts() {
  const actions = useActions()
  const ai = useAiActions()
  const { workspace } = useAppState()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (primaryMod(e) && e.key === 'Enter' && workspace.mode === 'ai') {
        e.preventDefault()
        void ai.generate()
        return
      }
      if (primaryMod(e) && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault()
        actions.copyCombination()
        return
      }
      if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) actions.drawAll()
        return
      }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1]
      const slot = digit ? workspace.draw.slots[Number(digit) - 1] : undefined
      if (!slot) return
      e.preventDefault()
      if (e.shiftKey) actions.toggleLock(slot.id)
      else actions.drawSlot(slot.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, ai, workspace.mode, workspace.draw.slots])
}

export function MainScreen() {
  const { workspace, rolls } = useAppState()
  const actions = useActions()
  useShortcuts()

  return (
    <main className="main-screen">
      <div className="slots">
        {(['genre', 'keyword'] as const).map((kind) => (
          <SlotGroup key={kind} kind={kind} slots={slotsOf(workspace.draw, kind)} all={workspace.draw.slots} rolls={rolls} />
        ))}
      </div>

      <div className="draw-bar">
        <AddSlotButton kind="genre" count={slotsOf(workspace.draw, 'genre').length} />
        <div className="draw-bar-center">
          <button type="button" className="draw-button" onClick={actions.drawAll}>
            <SpinIcon width={22} height={22} />
            回す
            <kbd>Space</kbd>
          </button>
          <button type="button" className="ghost" onClick={actions.copyCombination} title={shortcut('C', true)}>
            <CopyIcon />
            組み合わせをコピー
          </button>
        </div>
        <AddSlotButton kind="keyword" count={slotsOf(workspace.draw, 'keyword').length} />
      </div>

      {workspace.mode === 'human' ? <HumanIdeaPanel /> : <AiIdeaPanel />}
    </main>
  )
}

/** スロットを足すボタン。上限なら押せない */
function AddSlotButton({ kind, count }: { kind: SlotKind; count: number }) {
  const actions = useActions()
  const { max } = SLOT_LIMITS[kind]
  return (
    <button
      type="button"
      className={`ghost slot-add slot-add--${kind}`}
      onClick={() => actions.addSlot(kind)}
      disabled={count >= max}
      title={count >= max ? `${KIND_LABELS[kind]}は ${max} つまで` : `${KIND_LABELS[kind]}を足す`}
    >
      <PlusIcon />
      {KIND_LABELS[kind]}
      <span className="slot-add-count">
        {count}/{max}
      </span>
    </button>
  )
}

/** 同じ種類のスロットの並び。ジャンルが 0 のときは「ジャンル自由」の札を置く */
function SlotGroup({ kind, slots, all, rolls }: { kind: SlotKind; slots: Slot[]; all: Slot[]; rolls: Record<string, number> }) {
  const actions = useActions()
  const label = KIND_LABELS[kind]
  const canRemove = slots.length > SLOT_LIMITS[kind].min
  if (slots.length === 0) {
    return (
      <section className="slot slot-free" aria-label={`${label}自由`}>
        <p className="slot-free-title">{label}自由</p>
        <p className="hint">AI はキーワードに合う{label}を選びます</p>
        <button type="button" className="ghost" onClick={() => actions.addSlot(kind)}>
          <PlusIcon width={14} height={14} />
          {label}を足す
        </button>
      </section>
    )
  }
  return (
    <>
      {slots.map((slot, n) => {
        const index = all.findIndex((x) => x.id === slot.id)
        return (
          <SlotCard
            key={slot.id}
            label={slots.length > 1 || kind === 'keyword' ? `${label} ${n + 1}` : label}
            shortcut={shortcutOf(index)}
            index={index}
            dictionary={dictionaryFor(kind, dictionaries)}
            slot={slot}
            roll={rolls[slot.id] ?? 0}
            onReroll={() => actions.drawSlot(slot.id)}
            onToggleLock={() => actions.toggleLock(slot.id)}
            onManual={(v) => actions.setManual(slot.id, v)}
            onCategories={(ids) => actions.setCategories(slot.id, ids)}
            onRemove={canRemove ? () => actions.removeSlot(slot.id) : undefined}
          />
        )
      })}
    </>
  )
}
