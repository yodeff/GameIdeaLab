import { existsSync, renameSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrations'

/** ほかの接続が書いている間に待つ時間（すぐに「使用中」で失敗しないように） */
const BUSY_TIMEOUT_MS = 5_000

/** DB を開いてマイグレーションを適用する。path に ':memory:' を渡せばテスト用 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db)
  } catch (e) {
    db.close() // 開いたままだとファイルを握り続ける
    throw e
  }
  return db
}

/** 読み取り専用で開く（開発用の道具が設定だけを読むときなど。書かない・マイグレーションしない） */
export function openDatabaseReadOnly(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true })
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  return db
}

/**
 * 整合性の検査。壊れていれば false（開けない・検査で例外も壊れているとみなす）。
 * 起動時、ほかに DB を使う接続が無いときだけ呼ぶ。読み取り専用で開くと、残った WAL を正しく読めず
 * 健全な DB を壊れていると誤って判定することがある（2026-11-05、LEARNINGS L-20）ので、普通に開く
 */
export function isHealthy(path: string): boolean {
  if (!existsSync(path)) return true
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(path)
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    const rows = db.prepare('PRAGMA quick_check').all() as { quick_check?: string }[]
    return rows.length === 1 && rows[0]?.quick_check === 'ok'
  } catch {
    return false
  } finally {
    db?.close()
  }
}

export type RecoveryReport = {
  movedTo: string
  settings: number
  workspace: boolean
  ideas: number
}

/**
 * 壊れた DB を脇へ移し（消さない）、新しい DB を作って、読めるものだけを移す（2026-11-05、LEARNINGS L-20）。
 * 表ごと・案は 1 件ずつ読むので、壊れた場所以外は残せる
 */
export function recoverDatabase(path: string, now: Date): RecoveryReport {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const movedTo = `${path}.corrupt-${stamp}`
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(path + suffix)) renameSync(path + suffix, movedTo + suffix)
  }

  const report: RecoveryReport = { movedTo, settings: 0, workspace: false, ideas: 0 }
  const fresh = openDatabase(path)
  let old: DatabaseSync | null = null
  try {
    old = new DatabaseSync(movedTo, { readOnly: true })
    const settings = safeAll(old, 'SELECT key, value FROM settings') as { key: string; value: string }[]
    const putSetting = fresh.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    for (const s of settings) {
      putSetting.run(s.key, s.value)
      report.settings++
    }
    const ws = safeAll(old, 'SELECT version, value FROM workspace WHERE id = 1')[0] as { version: number; value: string } | undefined
    if (ws) {
      fresh.prepare('INSERT OR REPLACE INTO workspace (id, version, value) VALUES (1, ?, ?)').run(ws.version, ws.value)
      report.workspace = true
    }
    // 案は rowid ごとに読む。壊れたページにある行だけを諦める
    const maxRow = (safeAll(old, 'SELECT max(rowid) AS m FROM ideas')[0] as { m: number | null } | undefined)?.m ?? 0
    const columns = (fresh.prepare('PRAGMA table_info(ideas)').all() as { name: string }[]).map((c) => c.name)
    const insert = fresh.prepare(`INSERT OR IGNORE INTO ideas (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    const select = old.prepare(`SELECT ${columns.join(', ')} FROM ideas WHERE rowid = ?`)
    fresh.exec('PRAGMA foreign_keys = OFF') // 親が欠けた派生案も残す
    for (let rowid = 1; rowid <= maxRow; rowid++) {
      try {
        const row = select.get(rowid) as Record<string, string | number | null> | undefined
        if (!row) continue
        insert.run(...columns.map((c) => row[c] ?? null))
        report.ideas++
      } catch {
        // この行は読めない
      }
    }
    fresh.exec('PRAGMA foreign_keys = ON')
  } catch {
    // 古い DB がまったく開けなくても、新しい DB で起動できればよい
  } finally {
    old?.close()
    fresh.close()
  }
  return report
}

function safeAll(db: DatabaseSync, sql: string): unknown[] {
  try {
    return db.prepare(sql).all()
  } catch {
    return []
  }
}
