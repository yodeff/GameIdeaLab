// メイン画面（design/03 §2）
import { useEffect } from 'react'
import { dictionaryFor, type SlotId } from '@core/draw'
import { useAiActions } from '../app/AiContext'
import { useActions, useAppState } from '../app/AppContext'
import { dictionaries } from '../app/dictionaries'
import { AiIdeaPanel } from '../components/AiIdeaPanel'
import { HumanIdeaPanel } from '../components/HumanIdeaPanel'
import { CopyIcon, SpinIcon } from '../components/icons'
import { SlotCard } from '../components/SlotCard'

const SLOTS: { id: SlotId; label: string; key: string }[] = [
  { id: 'keyword1', label: 'キーワード 1', key: '1' },
  { id: 'keyword2', label: 'キーワード 2', key: '2' },
  { id: 'genre', label: 'ゲームジャンル', key: '3' }
]

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** キー操作（design/03 §2.5）。入力欄にいるときは抽選しない */
function useShortcuts() {
  const actions = useActions()
  const ai = useAiActions()
  const { workspace } = useAppState()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter' && workspace.mode === 'ai') {
        e.preventDefault()
        void ai.generate()
        return
      }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
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
      const slot = SLOTS.find((s) => e.code === `Digit${s.key}` || e.code === `Numpad${s.key}`)
      if (!slot) return
      e.preventDefault()
      if (e.shiftKey) actions.toggleLock(slot.id)
      else actions.drawSlot(slot.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, ai, workspace.mode])
}

export function MainScreen() {
  const { workspace, rolls } = useAppState()
  const actions = useActions()
  useShortcuts()

  return (
    <main className="main-screen">
      <div className="slots">
        {SLOTS.map((s, index) => (
          <SlotCard
            key={s.id}
            label={s.label}
            shortcut={s.key}
            index={index}
            dictionary={dictionaryFor(s.id, dictionaries)}
            state={workspace.draw.slots[s.id]}
            config={workspace.draw.configs[s.id]}
            roll={rolls[s.id]}
            onReroll={() => actions.drawSlot(s.id)}
            onToggleLock={() => actions.toggleLock(s.id)}
            onManual={(v) => actions.setManual(s.id, v)}
            onCategories={(ids) => actions.setCategories(s.id, ids)}
          />
        ))}
      </div>

      <div className="draw-bar">
        <button type="button" className="draw-button" onClick={actions.drawAll}>
          <SpinIcon width={22} height={22} />
          回す
          <kbd>Space</kbd>
        </button>
        <button type="button" className="ghost" onClick={actions.copyCombination} title="Ctrl+Shift+C">
          <CopyIcon />
          組み合わせをコピー
        </button>
      </div>

      {workspace.mode === 'human' ? <HumanIdeaPanel /> : <AiIdeaPanel />}
    </main>
  )
}
