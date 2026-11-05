import { describe, expect, it } from 'vitest'
import { IpcChannel } from '@shared/ipc'
import { createHandlers, InvalidInputError } from '../../src/main/ipc/handlers'
import { openDatabase } from '../../src/main/storage'

const setup = () =>
  createHandlers({
    db: openDatabase(':memory:'),
    appInfo: () => ({ name: 'test', version: '0.0.0', platform: 'test' }),
    now: () => new Date('2026-11-05T00:00:00.000Z'),
    newId: () => 'fixed-id'
  })

describe('IPC のハンドラー', () => {
  it('すべてのチャンネルにハンドラーがある', () => {
    expect(Object.keys(setup()).sort()).toEqual(Object.values(IpcChannel).sort())
  })

  it.each([
    [IpcChannel.workspaceSave, { version: 1, mode: 'human' }],
    [IpcChannel.workspaceSave, 'not an object'],
    [IpcChannel.settingsUpdate, { aiCount: 100 }],
    [IpcChannel.settingsUpdate, { __proto__: { theme: 'dark' }, evil: true }],
    [IpcChannel.ideaSaveHuman, { title: 'x'.repeat(201), body: '本文', combination: { keyword1: '鍵', keyword2: '扉', genre: 'パズル' } }],
    [IpcChannel.ideaSaveHuman, { title: '', body: '', combination: { keyword1: '鍵', keyword2: '扉', genre: 'パズル' } }]
  ])('%s は不正な入力を拒否する', (channel, value) => {
    const handlers = setup()
    expect(() => handlers[channel](value)).toThrow(InvalidInputError)
  })

  it('A モードの案を保存する', () => {
    const handlers = setup()
    const saved = handlers[IpcChannel.ideaSaveHuman]({
      title: '題',
      body: '本文',
      combination: { keyword1: '鍵', keyword2: '扉', genre: 'パズル' }
    })
    expect(saved).toMatchObject({ id: 'fixed-id', title: '題', createdAt: '2026-11-05T00:00:00.000Z', saved: true })
  })
})
