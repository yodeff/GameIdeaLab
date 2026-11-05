// スキーマの変更は追加だけする（DECISIONS/0004）。適用済みの版は PRAGMA user_version で見る。
import type { DatabaseSync } from 'node:sqlite'

type Migration = { version: number; sql: string }

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE ideas (
        id            TEXT PRIMARY KEY,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        source        TEXT NOT NULL CHECK (source IN ('human', 'ai')),
        saved         INTEGER NOT NULL DEFAULT 0,
        favorite      INTEGER NOT NULL DEFAULT 0,
        title         TEXT NOT NULL,
        concept       TEXT NOT NULL DEFAULT '',
        keyword1      TEXT NOT NULL,
        keyword2      TEXT NOT NULL,
        genre         TEXT NOT NULL,
        body_text     TEXT NOT NULL DEFAULT '',
        body_json     TEXT,
        direction     TEXT,
        memo          TEXT NOT NULL DEFAULT '',
        parent_id     TEXT REFERENCES ideas(id) ON DELETE SET NULL,
        derivation    TEXT,
        generation_id TEXT,
        model         TEXT,
        fidelity      TEXT,
        draw_context  TEXT
      );
      CREATE INDEX ideas_saved_created ON ideas (saved, created_at DESC);
      CREATE INDEX ideas_genre ON ideas (genre);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, value TEXT NOT NULL);
    `
  }
]

export const LATEST_VERSION = MIGRATIONS.at(-1)?.version ?? 0

function userVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  return row?.user_version ?? 0
}

/** 未適用のマイグレーションを順にトランザクションで適用する。DB の版がアプリより新しければ例外 */
export function migrate(db: DatabaseSync): void {
  const current = userVersion(db)
  if (current > LATEST_VERSION) {
    throw new Error(`データベースの版 ${current} はこのアプリ（版 ${LATEST_VERSION}）より新しい`)
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
}
