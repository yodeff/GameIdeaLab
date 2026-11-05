// IPC で受け取った値を検査する小さな道具。main は renderer からの入力を必ずこれで確かめる（design/02 §7）。

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const isString = (v: unknown, max: number, min = 0): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max

export const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

export const isOneOf = <T extends string>(v: unknown, values: readonly T[]): v is T =>
  typeof v === 'string' && (values as readonly string[]).includes(v)

export const isStringArray = (v: unknown, maxItems: number, maxLength: number): v is string[] =>
  Array.isArray(v) && v.length <= maxItems && v.every((s) => isString(s, maxLength))
