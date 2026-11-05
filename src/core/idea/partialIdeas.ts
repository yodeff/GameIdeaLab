// ストリームで少しずつ届く JSON（{"ideas":[{...},{...}]}）から、閉じた案を順に取り出す（design/04 §3.5）。
// 文字列の中かどうかと括弧の深さを追い、ideas の配列の要素が閉じるたびに 1 つ返す。

export type IdeaStreamParser = {
  /** 届いた文字を足し、新しく閉じた要素（JSON.parse 済み。壊れていれば Error）を返す */
  push: (chunk: string) => (unknown | Error)[]
  /** これまでに届いた全文 */
  text: () => string
}

export function createIdeaStreamParser(): IdeaStreamParser {
  let buffer = ''
  let pos = 0
  let depth = 0
  let inString = false
  let escaped = false
  let arrayDepth: number | null = null // ideas の配列の [ の深さ
  let itemStart: number | null = null

  const push = (chunk: string): (unknown | Error)[] => {
    buffer += chunk
    const done: (unknown | Error)[] = []
    for (; pos < buffer.length; pos++) {
      const ch = buffer[pos]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
      } else if (ch === '[' || ch === '{') {
        depth++
        if (ch === '[' && arrayDepth === null && depth === 2 && /"ideas"\s*:\s*$/.test(buffer.slice(0, pos))) {
          arrayDepth = depth
        } else if (ch === '{' && arrayDepth !== null && depth === arrayDepth + 1) {
          itemStart = pos
        }
      } else if (ch === ']' || ch === '}') {
        if (ch === '}' && itemStart !== null && arrayDepth !== null && depth === arrayDepth + 1) {
          const raw = buffer.slice(itemStart, pos + 1)
          try {
            done.push(JSON.parse(raw) as unknown)
          } catch (e) {
            done.push(e instanceof Error ? e : new Error(String(e)))
          }
          itemStart = null
        }
        if (ch === ']' && arrayDepth !== null && depth === arrayDepth) arrayDepth = null
        depth--
      }
    }
    return done
  }

  return { push, text: () => buffer }
}
