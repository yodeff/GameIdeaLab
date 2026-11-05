import { describe, expect, it } from 'vitest'
import { IpcChannel } from '@shared/ipc'
import { InvalidInputError, markdownFileName } from '../../src/main/ipc/handlers'
import { insertAiIdea } from '../../src/main/storage'
import { sampleIdea } from '../support/ideas'
import { scriptedClient, setupMain } from '../support/main'

const setup = () => setupMain(scriptedClient([]).client)
const combination = { keyword1: '鍵', keyword2: '扉', genre: 'パズル' }

describe('IPC のハンドラー', () => {
  it('すべてのチャンネルにハンドラーがある', () => {
    expect(Object.keys(setup().handlers).sort()).toEqual(Object.values(IpcChannel).sort())
  })

  it.each([
    [IpcChannel.workspaceSave, { version: 1, mode: 'human' }],
    [IpcChannel.workspaceSave, 'not an object'],
    [IpcChannel.settingsUpdate, { aiCount: 100 }],
    [IpcChannel.settingsUpdate, { __proto__: { theme: 'dark' }, evil: true }],
    [IpcChannel.ideaSaveHuman, { title: 'x'.repeat(201), body: '本文', combination }],
    [IpcChannel.ideaSaveHuman, { title: '', body: '', combination }]
  ])('%s は不正な入力を拒否する', (channel, value) => {
    const { handlers } = setup()
    expect(() => handlers[channel](value)).toThrow(InvalidInputError)
  })

  it.each([
    [IpcChannel.aiGenerate, { combination, count: 11, fidelity: 'standard' }],
    [IpcChannel.aiGenerate, { combination: { ...combination, genre: '' }, count: 3, fidelity: 'standard' }],
    [IpcChannel.aiDerive, { parentId: 'x', operation: 'genre' }],
    [IpcChannel.aiDerive, { parentId: 'x', operation: 'free', instruction: 'あ'.repeat(501) }],
    [IpcChannel.authSetApiKey, 'not-a-key']
  ])('%s は不正な入力を ok: false で返す', async (channel, value) => {
    const { handlers } = setup()
    expect(await handlers[channel](value)).toMatchObject({ ok: false, error: { kind: 'config-error' } })
  })

  it('A モードの案を保存する', () => {
    const saved = setup().handlers[IpcChannel.ideaSaveHuman]({ title: '題', body: '本文', combination })
    expect(saved).toMatchObject({ id: 'fixed-id', title: '題', createdAt: '2026-11-05T00:00:00.000Z', saved: true })
  })

  it('API キーは保存でき、状態には末尾 4 文字だけが出る', async () => {
    const { handlers } = setup()
    const result = await handlers[IpcChannel.authSetApiKey]('sk-test_0123456789abcdefWXYZ')
    expect(result).toMatchObject({ ok: true, value: { apiKey: { configured: true, last4: 'WXYZ' } } })
    expect(JSON.stringify(result)).not.toContain('0123456789')
  })

  it('サインインしていない状態を返す', async () => {
    expect(await setup().handlers[IpcChannel.authStatus]()).toEqual({
      chatgpt: { signedIn: false, account: null, planUsage: false },
      apiKey: { configured: false, last4: null },
      encryptionAvailable: true
    })
  })

  it('既定のブラウザで開けるのは許した https の先だけ', async () => {
    const m = setup()
    await m.handlers[IpcChannel.openExternal]('https://chatgpt.com/settings/usage')
    expect(m.opened).toEqual(['https://chatgpt.com/settings/usage'])
    await expect(m.handlers[IpcChannel.openExternal]('https://evil.example.com/')).rejects.toThrow(InvalidInputError)
    await expect(m.handlers[IpcChannel.openExternal]('file:///C:/Windows')).rejects.toThrow(InvalidInputError)
  })
})

describe('Markdown の書き出し（T-21）', () => {
  it('選んだ案を --- でつないで書き、1 案ならタイトルをファイル名にする', async () => {
    const m = setup()
    for (const [id, title] of [['x1', '寄生/自販機:チェーン'], ['x2', '二つ目']] as const) {
      insertAiIdea(m.db, { body: sampleIdea({ title }), combination, generationId: 'g', model: 'm', fidelity: 'standard' }, id, '2026-11-05T00:00:00.000Z')
    }
    expect(await m.handlers[IpcChannel.ideaExportMarkdown](['x1'])).toEqual({ saved: true, fileName: '寄生自販機チェーン.md' })
    expect(await m.handlers[IpcChannel.ideaExportMarkdown](['x1', 'x2'])).toEqual({ saved: true, fileName: 'game-ideas-20261105.md' })
    expect(m.savedFiles[1]?.content.split('\n---\n')).toHaveLength(2)
    await expect(m.handlers[IpcChannel.ideaExportMarkdown]([])).rejects.toThrow(InvalidInputError)
    await expect(m.handlers[IpcChannel.ideaExportMarkdown](['missing'])).rejects.toThrow(InvalidInputError)
  })

  it('タイトルに使える文字が無ければ日付のファイル名', () => {
    const idea = { title: '///', } as Parameters<typeof markdownFileName>[0][number]
    expect(markdownFileName([idea], new Date('2026-11-05T00:00:00Z'))).toBe('game-ideas-20261105.md')
  })

  it('更新・削除・一覧は不正な入力を拒否する', () => {
    const { handlers } = setup()
    expect(() => handlers[IpcChannel.ideaUpdate]('', { memo: 'x' })).toThrow(InvalidInputError)
    expect(() => handlers[IpcChannel.ideaUpdate]('id', { evil: 1 })).toThrow(InvalidInputError)
    expect(() => handlers[IpcChannel.ideaDelete](42)).toThrow(InvalidInputError)
    expect(() => handlers[IpcChannel.ideaList]({ scope: 'saved' })).toThrow(InvalidInputError)
  })
})
