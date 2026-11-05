// モデルと考える深さ（速さ）の選択。B モードの上と設定画面で共通
import { useEffect } from 'react'
import type { AiReasoning } from '@core/settings'
import { isConnected, useAi, useAiActions } from '../app/AiContext'
import { useActions, useAppState } from '../app/AppContext'

export const DEFAULT_MODEL_LABEL = '既定（GPT-6.1-Sol）'

/** 考える深さ。fast モード（優先処理の料金区分）とは別もので、それは送らない */
export const REASONING_LABELS: Record<AiReasoning, string> = {
  default: 'モデルの既定',
  low: '浅い（速い）',
  medium: 'ふつう',
  high: '深い（遅い）'
}

/** 接続していてモデル一覧がまだなら読む */
export function useModels() {
  const ai = useAi()
  const actions = useAiActions()
  const { settings } = useAppState()
  const connected = isConnected(ai.auth, settings.aiConnection)
  useEffect(() => {
    if (connected && ai.models === null && ai.modelsError === null) void actions.loadModels()
    // 接続が変わったときだけ読み直す（actions は毎回作り直されるので依存に入れない）
  }, [connected, settings.aiConnection]) // eslint 不使用
  return { models: ai.models, error: ai.modelsError, connected }
}

export function ModelSelect({ id }: { id?: string }) {
  const { settings } = useAppState()
  const app = useActions()
  const { models } = useModels()
  return (
    <select
      id={id}
      value={settings.aiModel ?? ''}
      aria-label="モデル"
      onChange={(e) => void app.updateSettings({ aiModel: e.target.value || null })}
    >
      <option value="">{DEFAULT_MODEL_LABEL}</option>
      {models?.map((m) => (
        <option key={m.id} value={m.id} title={m.description ?? ''}>
          {m.label}
        </option>
      ))}
      {settings.aiModel && !models?.some((m) => m.id === settings.aiModel) && <option value={settings.aiModel}>{settings.aiModel}</option>}
    </select>
  )
}

export function ReasoningSelect({ id }: { id?: string }) {
  const { settings } = useAppState()
  const app = useActions()
  const { models } = useModels()
  const current = models?.find((m) => m.id === (settings.aiModel ?? 'gpt-6.1-sol'))
  const levels = current && current.reasoningLevels.length > 0 ? current.reasoningLevels : (['low', 'medium', 'high'] as const)
  const options: AiReasoning[] = ['default', ...levels]
  return (
    <select
      id={id}
      value={settings.aiReasoning}
      aria-label="考える深さ"
      title="考える深さ。浅いほど早く届き、利用量も少なくなります。深いほど時間と利用量が増えます"
      onChange={(e) => void app.updateSettings({ aiReasoning: e.target.value as AiReasoning })}
    >
      {(options.includes(settings.aiReasoning) ? options : [...options, settings.aiReasoning]).map((r) => (
        <option key={r} value={r}>
          {REASONING_LABELS[r]}
          {r === 'default' && current?.defaultReasoning ? `（${REASONING_LABELS[current.defaultReasoning as AiReasoning] ?? current.defaultReasoning}）` : ''}
        </option>
      ))}
    </select>
  )
}
