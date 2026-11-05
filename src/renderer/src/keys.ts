// キー操作の修飾キー。Mac は ⌘（metaKey）、ほかは Ctrl（design/03 §2.5）

type ModifierState = { ctrlKey: boolean; metaKey: boolean }

/** 主な修飾キーが押されているか。isMac を引数にして、DOM なしでテストできるようにしている */
export const primaryModPressed = (e: ModifierState, mac: boolean): boolean => (mac ? e.metaKey : e.ctrlKey)

/** キーの組み合わせの表示（例: Mac は「⌘S」「⇧⌘C」、ほかは「Ctrl+S」「Ctrl+Shift+C」） */
export function shortcutLabel(key: string, mac: boolean, shift = false): string {
  if (mac) return `${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)

export const primaryMod = (e: ModifierState) => primaryModPressed(e, isMac)
export const shortcut = (key: string, shift = false) => shortcutLabel(key, isMac, shift)
