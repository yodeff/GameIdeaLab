import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS, createRollCues } from '../../src/renderer/src/sound/rollCues'

function setup() {
  const played: string[] = []
  const cues = createRollCues(
    {
      loopStart: () => played.push('loopStart'),
      loopStop: () => played.push('loopStop'),
      stop: () => played.push('stop'),
      decide: () => played.push('decide')
    },
    {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>)
    }
  )
  const count = (name: string) => played.filter((p) => p === name).length
  return { cues, played, count }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('抽選の音の段取り', () => {
  it('いくつ回っても、回る音は 1 本だけ流す', () => {
    const { cues, count } = setup()
    cues.start()
    cues.start()
    cues.start()
    expect(count('loopStart')).toBe(1)
  })

  it('止まったスロットごとに鳴らし、全部が止まったら回る音を止めて決定を 1 回だけ鳴らす', () => {
    const { cues, played, count } = setup()
    cues.start()
    cues.start()
    cues.end(true)
    vi.advanceTimersByTime(SETTLE_MS * 2)
    expect(count('loopStop')).toBe(0)
    expect(count('decide')).toBe(0)
    cues.end(true)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(played).toEqual(['loopStart', 'stop', 'stop', 'loopStop', 'decide'])
  })

  it('演出なしで決まったスロットが同時にいくつあっても、決定は 1 回で、回る音は流さない', () => {
    const { cues, count } = setup()
    cues.instant()
    cues.instant()
    cues.instant()
    vi.advanceTimersByTime(SETTLE_MS)
    expect(count('decide')).toBe(1)
    expect(count('loopStart')).toBe(0)
  })

  it('止まってすぐに回し直したら、前の決定は鳴らさず、回る音を流し直す', () => {
    const { cues, count } = setup()
    cues.start()
    cues.end(true)
    cues.start()
    vi.advanceTimersByTime(SETTLE_MS * 3)
    expect(count('decide')).toBe(0)
    expect(count('loopStart')).toBe(2)
    cues.end(true)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(count('decide')).toBe(1)
  })

  it('途中で外れたスロットは止まる音を出さず、余分な end は無視する', () => {
    const { cues, count } = setup()
    cues.start()
    cues.end(false)
    cues.end(true)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(count('stop')).toBe(0)
    expect(count('loopStop')).toBe(1)
    expect(count('decide')).toBe(1)
  })
})
