// 設定（design/04 §4 の settings 表）。値の検査と初期値。
import { isInt, isOneOf, isRecord, isString } from './validate'

export type Theme = 'system' | 'light' | 'dark'
export type Fidelity = 'strict' | 'standard' | 'free'
export type AiConnection = 'chatgpt' | 'apiKey'
/** 考える深さ。default はモデルの既定に任せる（送らない） */
export type AiReasoning = 'default' | 'low' | 'medium' | 'high'
export const AI_REASONING_LEVELS: readonly AiReasoning[] = ['default', 'low', 'medium', 'high']
export type WindowBounds = { x: number; y: number; width: number; height: number }

export type Settings = {
  aiConnection: AiConnection
  /** null なら既定（一覧に gpt-6.1-sol があればそれ） */
  aiModel: string | null
  aiCount: number
  aiFidelity: Fidelity
  aiReasoning: AiReasoning
  theme: Theme
  planNoticeShown: boolean
  windowBounds: WindowBounds | null
}

export const DEFAULT_SETTINGS: Settings = {
  aiConnection: 'chatgpt',
  aiModel: null,
  aiCount: 3,
  aiFidelity: 'standard',
  aiReasoning: 'default',
  theme: 'system',
  planNoticeShown: false,
  windowBounds: null
}

export const AI_COUNT_MIN = 1
export const AI_COUNT_MAX = 10

type Checker = { [K in keyof Settings]: (v: unknown) => v is Settings[K] }

const isBounds = (v: unknown): v is WindowBounds =>
  isRecord(v) &&
  isInt(v['x'], -100_000, 100_000) &&
  isInt(v['y'], -100_000, 100_000) &&
  isInt(v['width'], 200, 20_000) &&
  isInt(v['height'], 200, 20_000)

const CHECKS: Checker = {
  aiConnection: (v): v is AiConnection => isOneOf(v, ['chatgpt', 'apiKey'] as const),
  aiModel: (v): v is string | null => v === null || isString(v, 100, 1),
  aiCount: (v): v is number => isInt(v, AI_COUNT_MIN, AI_COUNT_MAX),
  aiFidelity: (v): v is Fidelity => isOneOf(v, ['strict', 'standard', 'free'] as const),
  aiReasoning: (v): v is AiReasoning => isOneOf(v, AI_REASONING_LEVELS),
  theme: (v): v is Theme => isOneOf(v, ['system', 'light', 'dark'] as const),
  planNoticeShown: (v): v is boolean => typeof v === 'boolean',
  windowBounds: (v): v is WindowBounds | null => v === null || isBounds(v)
}

export const SETTING_KEYS = Object.keys(CHECKS) as (keyof Settings)[]

/** 外から来た部分的な設定を検査する。知らないキーや不正な値があれば null */
export function parseSettingsPatch(v: unknown): Partial<Settings> | null {
  if (!isRecord(v)) return null
  const patch: Partial<Record<keyof Settings, unknown>> = {}
  for (const [key, value] of Object.entries(v)) {
    if (!(key in CHECKS)) return null
    const k = key as keyof Settings
    if (!CHECKS[k](value)) return null
    patch[k] = value
  }
  return patch as Partial<Settings>
}

/** 保存されていた 1 項目を読む。壊れていれば初期値 */
export function readSetting<K extends keyof Settings>(key: K, value: unknown): Settings[K] {
  return CHECKS[key](value) ? (value as Settings[K]) : DEFAULT_SETTINGS[key]
}
