// 生成・派生の依頼（IPC の入力）の型と検査。
import { MANUAL_MAX_LENGTH, SLOT_IDS, type Combination } from '../draw'
import { AI_COUNT_MAX, AI_COUNT_MIN, type Fidelity } from '../settings'
import { isInt, isOneOf, isRecord, isString } from '../validate'
import { DERIVE_INSTRUCTION_MAX, type DeriveOperation } from './prompts'

export type GenerateRequest = { combination: Combination; count: number; fidelity: Fidelity }

export type DeriveRequest = {
  parentId: string
  operation: DeriveOperation
  /** 'genre' のとき必須 */
  genre?: string
  /** 'free' のとき必須 */
  instruction?: string
}

const OPERATIONS = ['original', 'gameplay', 'simpler', 'genre', 'free'] as const

function parseCombination(v: unknown): Combination | null {
  if (!isRecord(v) || !SLOT_IDS.every((s) => isString(v[s], MANUAL_MAX_LENGTH, 1))) return null
  return { keyword1: v['keyword1'] as string, keyword2: v['keyword2'] as string, genre: v['genre'] as string }
}

export function parseGenerateRequest(v: unknown): GenerateRequest | null {
  if (!isRecord(v) || !isInt(v['count'], AI_COUNT_MIN, AI_COUNT_MAX)) return null
  if (!isOneOf(v['fidelity'], ['strict', 'standard', 'free'] as const)) return null
  const combination = parseCombination(v['combination'])
  return combination ? { combination, count: v['count'], fidelity: v['fidelity'] } : null
}

export function parseDeriveRequest(v: unknown): DeriveRequest | null {
  if (!isRecord(v) || !isString(v['parentId'], 100, 1) || !isOneOf(v['operation'], OPERATIONS)) return null
  const operation = v['operation']
  const request: DeriveRequest = { parentId: v['parentId'], operation }
  if (operation === 'genre') {
    if (!isString(v['genre'], MANUAL_MAX_LENGTH, 1)) return null
    request.genre = v['genre']
  }
  if (operation === 'free') {
    if (!isString(v['instruction'], DERIVE_INSTRUCTION_MAX) || v['instruction'].trim() === '') return null
    request.instruction = v['instruction'].trim()
  }
  return request
}
