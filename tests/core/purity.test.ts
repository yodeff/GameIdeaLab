import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// src/core は Electron・React・Node の API に依存しない（AGENTS.md §4）。Web 版へ持っていけるようにするため
const CORE = join(import.meta.dirname, '../../src/core')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('src/core', () => {
  it('相対パスと @core 以外を import しない', () => {
    const offending: string[] = []
    for (const file of files(CORE)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
        const target = match[1] ?? ''
        if (!target.startsWith('.') && !target.startsWith('@core/')) offending.push(`${relative(CORE, file)}: ${target}`)
      }
    }
    expect(offending).toEqual([])
  })
})
