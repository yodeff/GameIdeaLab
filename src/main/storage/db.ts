import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrations'

/** DB を開いてマイグレーションを適用する。path に ':memory:' を渡せばテスト用 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  try {
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db)
  } catch (e) {
    db.close() // 開いたままだとファイルを握り続ける
    throw e
  }
  return db
}
