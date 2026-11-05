import { describe, expect, it } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import { MAX_PARALLEL } from '../../src/main/ai/jobs'
import { HISTORY_KEEP, getIdea, insertAiIdea, pruneHistory } from '../../src/main/storage'
import { sampleIdea } from '../support/ideas'
import { chunk, perRequestClient, setupMain } from '../support/main'

const combination = { genres: ['経営シミュレーション'], keywords: ['自動販売機', '寄生'] }
const one = (title: string, direction: '王道' | '変化球' | '実験的' = '王道') =>
  chunk(JSON.stringify({ ideas: [sampleIdea({ title, direction })] }))
const directionOf = (input: string) => /方向は「(.+?)」/.exec(input)?.[1] as '王道' | '変化球' | '実験的'

describe('生成のジョブ（1 依頼 1 案を並べて走らせる）', () => {
  it('案ごとに別の依頼を出し、届いた案を履歴に保存してから送り、最後に done', async () => {
    const { client, requests, stats } = perRequestClient((req, n) => ({ chunks: one(`案${n}`, directionOf(req.input)) }))
    const m = setupMain(client)
    const done = m.finished()
    const jobId = m.jobs.generate({ combination, count: 3, fidelity: 'strict' })
    await done
    expect(m.events.map((e) => e.type)).toEqual(['started', 'idea', 'idea', 'idea', 'done'])
    expect(requests).toHaveLength(3)
    expect(stats.maxConcurrent).toBe(3)
    expect(requests.map((r) => directionOf(r.input)).sort()).toEqual(['変化球', '実験的', '王道'].sort())
    expect(requests[2]?.input).toMatch(/変える軸は「.+」/)
    expect(requests[0]?.input).toContain('3 案を別々に作る')
    const ideas = m.events.flatMap((e) => (e.type === 'idea' ? [e.idea] : []))
    expect(ideas[0]).toMatchObject({ saved: false, source: 'ai', generationId: jobId, combination, fidelity: 'strict', model: 'gpt-6.1-sol' })
    expect(getIdea(m.db, ideas[1]?.id ?? '')).not.toBeNull()
    expect(requests[0]?.instructions).toContain('すべてのキーワードを')
    expect(requests[0]?.textFormat).toMatchObject({ type: 'json_schema', strict: true })
  })

  it(`同時に走らせる依頼は ${MAX_PARALLEL} 本まで。10 案も全部届く`, async () => {
    const { client, requests, stats } = perRequestClient((_req, n) => ({ chunks: one(`案${n}`), delayMs: 3 }))
    const m = setupMain(client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 10, fidelity: 'standard' })
    await done
    expect(requests).toHaveLength(10)
    expect(stats.maxConcurrent).toBe(MAX_PARALLEL)
    expect(m.events.at(-1)).toMatchObject({ type: 'done', received: 10, skipped: 0 })
  })

  it('読めない案や途中で切れた枠は 1 回だけやり直す', async () => {
    const { client, requests } = perRequestClient((req, n) => {
      if (n === 0) return { chunks: ['これは JSON ではない'] }
      if (n === 1) return { chunks: one('途中まで').slice(0, 3), fail: new AiError('incomplete') }
      return { chunks: one(`案${n}`, directionOf(req.input)) }
    })
    const m = setupMain(client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    await done
    expect(requests).toHaveLength(5)
    expect(m.events.at(-1)).toMatchObject({ type: 'done', received: 3, skipped: 0 })
  })

  it('やり直しても読めない枠は数えて知らせ、ほかの案は届ける', async () => {
    const { client } = perRequestClient((req, n) => (directionOf(req.input) === '変化球' ? { chunks: ['壊れた'] } : { chunks: one(`案${n}`) }))
    const m = setupMain(client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    await done
    expect(m.events.at(-1)).toMatchObject({ type: 'done', received: 2, skipped: 1 })
  })

  it('利用量の上限などはやり直さず、ほかの枠も止めて区別して送る', async () => {
    const { client, requests } = perRequestClient((_req, n) =>
      n === 1
        ? { chunks: [], fail: new AiError('usage-limit', 'subscription_sharing_usage_limit_exceeded') }
        : { chunks: one(`案${n}`), delayMs: n === 0 ? 1 : 30 }
    )
    const m = setupMain(client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 6, fidelity: 'standard' })
    await done
    expect(m.events.at(-1)).toMatchObject({ type: 'error', error: { kind: 'usage-limit', detail: 'subscription_sharing_usage_limit_exceeded' } })
    expect(requests.length).toBeLessThan(6)
    expect(m.jobs.isRunning()).toBe(false)
  })

  it('同時に 1 つのジョブだけ。中止すると cancelled', async () => {
    const { client } = perRequestClient((_req, n) => ({ chunks: one(`案${n}`), delayMs: 20 }))
    const m = setupMain(client)
    const done = m.finished()
    const jobId = m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    expect(() => m.jobs.generate({ combination, count: 3, fidelity: 'standard' })).toThrow(AiError)
    m.jobs.cancel(jobId)
    await done
    expect(m.events.at(-1)).toMatchObject({ type: 'error', error: { kind: 'cancelled' } })
    expect(m.jobs.isRunning()).toBe(false)
  })

  it('派生は 1 依頼で、元を書き換えず、元の ID と操作を持つ新しい案を作る', async () => {
    const { client, requests } = perRequestClient(() => ({ chunks: one('パズル版') }))
    const m = setupMain(client)
    const parent = insertAiIdea(
      m.db,
      { body: sampleIdea(), combination, generationId: 'g0', model: 'gpt-6.1-sol', fidelity: 'free' },
      'parent-1',
      '2026-11-05T00:00:00.000Z'
    )
    const done = m.finished()
    m.jobs.derive({ parentId: parent.id, operation: 'genre', genre: 'パズル' })
    await done
    const idea = m.events.flatMap((e) => (e.type === 'idea' ? [e.idea] : []))[0]
    expect(requests).toHaveLength(1)
    expect(idea).toMatchObject({ parentId: 'parent-1', derivation: '別のジャンルで', title: 'パズル版', fidelity: 'free' })
    expect(idea?.combination.genres).toEqual(['パズル'])
    expect(getIdea(m.db, 'parent-1')?.title).toBe('寄生自販機チェーン')
    expect(requests[0]?.input).toContain('元の案')
  })
})

describe('履歴の整理（D-17）', () => {
  it('保存していない案を新しい順に残し、保存済みは消さない', () => {
    const m = setupMain(perRequestClient(() => ({ chunks: [] })).client)
    const base = { body: sampleIdea(), combination, generationId: 'g', model: 'm', fidelity: 'standard' as const }
    for (let i = 0; i < HISTORY_KEEP + 5; i++) insertAiIdea(m.db, base, `h-${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString())
    m.db.prepare("UPDATE ideas SET saved = 1 WHERE id = 'h-0'").run()
    expect(pruneHistory(m.db)).toBe(4)
    expect(getIdea(m.db, 'h-0')).not.toBeNull()
    expect(getIdea(m.db, 'h-1')).toBeNull()
    expect(getIdea(m.db, `h-${HISTORY_KEEP + 4}`)).not.toBeNull()
  })
})
