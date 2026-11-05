import { describe, expect, it } from 'vitest'
import { primaryModPressed, shortcutLabel } from '../../src/renderer/src/keys'

describe('修飾キー（Mac は ⌘、ほかは Ctrl）', () => {
  it('Mac では ⌘ だけ、ほかでは Ctrl だけを主な修飾キーとみなす', () => {
    expect(primaryModPressed({ ctrlKey: false, metaKey: true }, true)).toBe(true)
    expect(primaryModPressed({ ctrlKey: true, metaKey: false }, true)).toBe(false)
    expect(primaryModPressed({ ctrlKey: true, metaKey: false }, false)).toBe(true)
    expect(primaryModPressed({ ctrlKey: false, metaKey: true }, false)).toBe(false)
  })

  it('表示は Mac の記号と Windows の書き方に合わせる', () => {
    expect(shortcutLabel('S', true)).toBe('⌘S')
    expect(shortcutLabel('C', true, true)).toBe('⇧⌘C')
    expect(shortcutLabel('S', false)).toBe('Ctrl+S')
    expect(shortcutLabel('C', false, true)).toBe('Ctrl+Shift+C')
  })
})
