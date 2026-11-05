// 起動時の控え（DECISIONS/0004）。前回から 24 時間以上たっていれば VACUUM INTO で書き出し、新しい 7 つを残す。
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

const PREFIX = 'game-idea-lab-'
const NAME = /^game-idea-lab-(\d{8})-(\d{6})\.sqlite$/

export const BACKUP_KEEP = 7
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function parseStamp(name: string): number | null {
  const m = NAME.exec(name)
  if (!m?.[1] || !m[2]) return null
  const [date, time] = [m[1], m[2]]
  return new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
    Number(time.slice(4, 6))
  ).getTime()
}

/** 控えの一覧（新しい順） */
export function listBackups(dir: string): { name: string; time: number }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => ({ name, time: parseStamp(name) }))
    .filter((b): b is { name: string; time: number } => b.time !== null)
    .sort((a, b) => b.time - a.time)
}

/** 必要なら控えを作る。作ったときはそのファイル名を返す */
export function backupIfDue(db: DatabaseSync, dir: string, now: Date): string | null {
  const latest = listBackups(dir)[0]
  if (latest && now.getTime() - latest.time < BACKUP_INTERVAL_MS) return null

  mkdirSync(dir, { recursive: true })
  const name = `${PREFIX}${stamp(now)}.sqlite`
  const target = join(dir, name).replaceAll('\\', '/').replaceAll("'", "''")
  db.exec(`VACUUM INTO '${target}'`)

  for (const old of listBackups(dir).slice(BACKUP_KEEP)) rmSync(join(dir, old.name), { force: true })
  return name
}
