# 0004: 保存は `node:sqlite`

- 状態: 採用（2026-11-05、STEP 3）
- 関連: 企画書 §14、STATE の U-1、STEP 1 のリスク R-7、LEARNINGS L-3

## Context

企画書は SQLite を第一候補とし、データを失いにくい保存方式を求めている（§14）。Electron で SQLite を使う方法は、ネイティブモジュール（`better-sqlite3`）か、Node に組み込みの `node:sqlite` の 2 つ。

## Decision

`node:sqlite` の `DatabaseSync` を main プロセスで使う。

2026-11-05 に、Electron 45（Node 24.22.2）と開発用の Node 24.12 の両方で次が動くことを確かめた。

- `PRAGMA journal_mode=WAL`
- `PRAGMA user_version`（スキーマの版の管理に使う）
- `VACUUM INTO '<path>'`（起動時の控えに使う）と `backup()`
- FTS5、JSON 関数、日本語の `LIKE`

### 使い方の決まり

- DB は `app.getPath('userData')/game-idea-lab.sqlite` に 1 つ。WAL モード。
- スキーマの変更は `src/main/storage/migrations.ts` に追加だけする。`user_version` で適用済みの版を見る。
- 起動時に、前回の控えから 24 時間以上たっていれば `VACUUM INTO` で `backups/` に控えを作り、新しい 7 つを残す。
- 保存の処理は `IdeaRepository` などのインターフェースの後ろに置く。`node:sqlite` を直接触るのは `src/main/storage/` だけ。
- テストは Vitest（Node 24.12）で `:memory:` の DB に対して行う。

## Alternatives

- **better-sqlite3**: 実績は多いが、Electron の版に合わせたネイティブのビルドが要り、Windows の CI と配布で失敗しやすい。`node:sqlite` が使えなくなったときの代わりとする。
- **JSON ファイル**: 単純だが、検索・部分更新・同時書き込みに弱い。

## Consequences

- 依存パッケージが増えない。
- `node:sqlite` は Node 24 では正式版ではないため、Electron を上げるときに API の変化を確かめる（R-7）。保存の処理をインターフェースの後ろに置いているので、替えるときの範囲は `src/main/storage/` に限られる。
