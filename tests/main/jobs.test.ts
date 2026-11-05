import { describe, expect, it } from 'vitest'
import { AiError } from '../../src/main/ai/errors'
import { HISTORY_KEEP, getIdea, insertAiIdea, pruneHistory } from '../../src/main/storage'
import { sampleIdea } from '../support/ideas'
import { chunk, scriptedClient, setupMain } from '../support/main'

const combination = { keyword1: '自動販売機', keyword2: '寄生', genre: '経営シミュレーション' }
const threeIdeas = JSON.stringify({
  ideas: [sampleIdea(), sampleIdea({ direction: '変化球', title: '二つ目' }), sampleIdea({ direction: '実験的', title: '三つ目' })]
})

describe('生成のジョブ', () => {
  it('届いた案を 1 つずつ履歴に保存してから送り、最後に done', async () => {
    const { client, requests } = scriptedClient(chunk(threeIdeas))
    const m = setupMain(client)
    const done = m.finished()
    const jobId = m.jobs.generate({ combination, count: 3, fidelity: 'strict' })
    await done
    expect(m.events.map((e) => e.type)).toEqual(['started', 'idea', 'idea', 'idea', 'done'])
    const ideas = m.events.flatMap((e) => (e.type === 'idea' ? [e.idea] : []))
    expect(ideas.map((i) => i.title)).toEqual(['寄生自販機チェーン', '二つ目', '三つ目'])
    expect(ideas[0]).toMatchObject({ saved: false, source: 'ai', generationId: jobId, combination, fidelity: 'strict', model: 'gpt-6.1-sol' })
    expect(getIdea(m.db, ideas[1]?.id ?? '')?.body?.title).toBe('二つ目')
    // 指示文に忠実度、依頼に方向。text.format は JSON Schema
    expect(requests[0]?.instructions).toContain('両方を')
    expect(requests[0]?.input).toContain('3. 実験的')
    expect(requests[0]?.textFormat).toMatchObject({ type: 'json_schema', strict: true })
  })

  it('壊れた案だけを捨てて続ける', async () => {
    const text = JSON.stringify({ ideas: [sampleIdea(), { ...sampleIdea(), core_loop: '' }, sampleIdea({ title: '三つ目' })] })
    const m = setupMain(scriptedClient(chunk(text)).client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    await done
    expect(m.events.at(-1)).toMatchObject({ type: 'done', received: 2, skipped: 1 })
  })

  it('読める案が 1 つも無ければ invalid-output', async () => {
    const m = setupMain(scriptedClient(['これは JSON ではない']).client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    await done
    expect(m.events.at(-1)).toMatchObject({ type: 'error', error: { kind: 'invalid-output' } })
  })

  it('接続の誤りを区別して送り、それまでに届いた案は残す', async () => {
    const half = threeIdeas.slice(0, Math.floor(threeIdeas.length * 0.5))
    const m = setupMain(scriptedClient(chunk(half), { fail: new AiError('usage-limit', 'subscription_sharing_usage_limit_exceeded') }).client)
    const done = m.finished()
    m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    await done
    const last = m.events.at(-1)
    expect(last).toMatchObject({ type: 'error', error: { kind: 'usage-limit', detail: 'subscription_sharing_usage_limit_exceeded' } })
    expect(last?.type === 'error' && last.received).toBeGreaterThan(0)
  })

  it('同時に 1 つだけ。中止すると cancelled', async () => {
    const m = setupMain(scriptedClient(chunk(threeIdeas, 3), { delayMs: 5 }).client)
    const done = m.finished()
    const jobId = m.jobs.generate({ combination, count: 3, fidelity: 'standard' })
    expect(() => m.jobs.generate({ combination, count: 3, fidelity: 'standard' })).toThrow(AiError)
    m.jobs.cancel(jobId)
    await done
    expect(m.events.at(-1)).toMatchObject({ type: 'error', error: { kind: 'cancelled' } })
    expect(m.jobs.isRunning()).toBe(false)
  })

  it('派生は元を書き換えず、元の ID と操作を持つ新しい案を作る', async () => {
    const derived = JSON.stringify({ ideas: [sampleIdea({ title: 'パズル版' })] })
    const { client, requests } = scriptedClient(chunk(derived))
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
    expect(idea).toMatchObject({ parentId: 'parent-1', derivation: '別のジャンルで', title: 'パズル版', fidelity: 'free' })
    expect(idea?.combination.genre).toBe('パズル')
    expect(getIdea(m.db, 'parent-1')?.title).toBe('寄生自販機チェーン')
    expect(requests[0]?.input).toContain('元の案')
  })
})

describe('履歴の整理（D-17）', () => {
  it('保存していない案を新しい順に残し、保存済みは消さない', () => {
    const m = setupMain(scriptedClient([]).client)
    const base = { body: sampleIdea(), combination, generationId: 'g', model: 'm', fidelity: 'standard' as const }
    for (let i = 0; i < HISTORY_KEEP + 5; i++) insertAiIdea(m.db, base, `h-${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString())
    m.db.prepare("UPDATE ideas SET saved = 1 WHERE id = 'h-0'").run()
    expect(pruneHistory(m.db)).toBe(4)
    expect(getIdea(m.db, 'h-0')).not.toBeNull() // 保存済み
    expect(getIdea(m.db, 'h-1')).toBeNull() // 古い履歴
    expect(getIdea(m.db, `h-${HISTORY_KEEP + 4}`)).not.toBeNull()
  })
})
