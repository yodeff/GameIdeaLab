# LEARNINGS — 開発で分かったこと

> 開発中に分かったこと（ハマった点、仕様や外部サービスの確認結果、採用しなかった案とその理由、運営者の指摘）を残す。
> この文書は公開する。メンテナーの環境だけに関わる学びは `private/NOTES.md` に書く（AGENTS.md §2）。
> エージェントは作業を始める前に先頭の一覧を読む。

## 書き方

- 1 件 1 節。番号は `L-<連番>`。消さない（誤りだと分かったら「訂正」を足し、一覧の状態を「訂正済み」にする）。
- 分類: `技術`（ライブラリ・ツールの挙動）／`仕様`（外部サービス・公式仕様の確認結果）／`設計`（採否の理由）／`指摘`（運営者からの指摘）／`進め方`（作業手順の学び）。
- **汎用**の欄: このプロジェクトの外でも役に立つなら「はい」。ほかのプロジェクトへ広げる候補になる。
- 本文は「何が起きたか → なぜか → どうしたか（反映先）」の順で短く書く。

## 一覧

| ID | 日付 | 分類 | 汎用 | 要点 |
|---|---|---|---|---|
| L-1 | 2026-11-05 | 技術 | はい | TypeScript 7 で `baseUrl` が廃止。`paths` は `./` 始まりの相対パスで書く |
| L-2 | 2026-11-05 | 技術 | はい | Electron の `sandbox: true` の preload は ESM を読めない。`"type": "module"` の構成では preload だけ CommonJS（`.cjs`）で出力する |
| L-3 | 2026-11-05 | 技術 | はい | Electron 45 は Node 24.22 を内蔵し、`node:sqlite`（SQLite 3.53.4）がそのまま使える。ネイティブモジュールの再ビルドが要らない |
| L-4 | 2026-11-05 | 仕様 | はい | Sign in with ChatGPT には OSS・ローカルアプリ向けの流れがあり、クライアントシークレットなしで利用者の ChatGPT プランから Responses API を呼べる。ただし `store: false`・`stream: true` が必須で、`temperature`・`max_output_tokens` は指定できない |
| L-5 | 2026-11-05 | 仕様 | はい | Sign in with ChatGPT の OSS 向けの流れは事前の承認なしで動いた。JSON Schema の構造化出力も使える。ただし `/v1/models` は `{models:[{slug,...}]}` の形で、`response.completed` の `output` は空。出力はストリームの途中のイベントから組み立てる |
| L-6 | 2026-11-05 | 技術 | はい | `node:sqlite` は Electron 45 と Node 24.12 の両方で WAL・`user_version`・`VACUUM INTO`・`backup()`・FTS5・JSON 関数が動く。控え・マイグレーション・全文検索まで追加の依存なしでできる |
| L-7 | 2026-11-05 | 技術 | はい | `node:sqlite` の `DatabaseSync` は開いた後に例外が起きても自動では閉じない。Windows ではファイルを握ったままになるので、初期化の失敗時は `close()` してから投げ直す |
| L-8 | 2026-11-05 | 進め方 | はい | 「カテゴリが均等か」のような確率のテストは、直近の語を避ける規則などほかの規則と混ぜずに、選ぶ関数そのものに対して書く |
| L-9 | 2026-11-05 | 進め方 | はい | renderer の API に「preload が無いときは localStorage で動く代わり」を用意すると、画面だけをブラウザで開いて操作の確認を自動化できる（将来の Web 版の足がかりにもなる） |

---

## L-1 TypeScript 7 で `baseUrl` が廃止された

- 起きたこと: `tsconfig` に `baseUrl: "."` と `paths: { "@core/*": ["src/core/*"] }` を書いたところ、`tsc` が TS5102（`baseUrl` は削除された）と TS5090（相対でないパスは不可）で止まった。
- 理由: TypeScript 7 で `baseUrl` が取り除かれ、`paths` は設定ファイルからの相対パスで解決するようになった。
- 対応: `baseUrl` を消し、`paths` を `["./src/core/*"]` の形にした（`tsconfig.base.json`）。

## L-2 sandbox の preload は CommonJS で出す

- 起きたこと: `package.json` が `"type": "module"` のため、electron-vite は preload を `index.mjs`（ESM）で出力した。
- 理由: Electron の `sandbox: true` の preload は ESM を読み込めない（CommonJS のみ）。sandbox はセキュリティのため外さない（企画書 §12.4）。
- 対応: `electron.vite.config.ts` の preload に `output: { format: 'cjs', entryFileNames: '[name].cjs' }` を指定し、main からは `../preload/index.cjs` を読む。起動して `window.gameIdeaLab` が見え、renderer から `require`・`process` が見えないことを確かめた。

## L-3 Electron 45 の `node:sqlite`

- 分かったこと: `ELECTRON_RUN_AS_NODE=1 electron -e ...` で確かめたところ、Electron 45.2.3 は Node 24.22.2・Chromium 156 を内蔵し、`require('node:sqlite')` の `DatabaseSync` が動いた（SQLite 3.53.4）。
- 意味: `better-sqlite3` のようなネイティブモジュールは Electron 向けの再ビルドが要り、Windows では失敗しやすい。`node:sqlite` なら追加の依存なしで SQLite を使える。
- 反映: STATE.md の U-1。採否は STEP 3 で決める（API の安定度と、WAL・バックアップの扱いを確かめてから）。

## L-4 Sign in with ChatGPT の OSS 向けの流れ（2026-11-05 時点、プレビュー）

- 分かったこと: OpenAI の公式文書に「オープンソースでローカルで動くアプリ」向けの流れがある。`client_id=dynamic_agent_client` で認可を始めるとサインインのときにクライアントが動的に登録され、`oaiapp_…` の `client_id` が発行される。受け口は `http://127.0.0.1:<ポート>/…`（`localhost` は不可）。スコープ `resource.invoke chatgpt.tokens.use.direct` に同意すると、アクセストークンで `POST https://api.openai.com/v1/responses` を利用者のプランで呼べる。
- 制約: `store: false`・`stream: true` が必須、`input` は配列、`temperature`・`top_p`・`max_output_tokens` などは送れない、`previous_response_id` は使えない。アクセストークンは 1 時間、リフレッシュトークンは 30 日で更新のたびに置き換わる。プランを使えるのは Plus・Pro の利用者（公式の案内）。
- 分からなかったこと: OSS アプリに事前の承認が要るか、構造化出力が使えるか、配布の条件。
- 反映: [research/sign-in-with-chatgpt.md](research/sign-in-with-chatgpt.md)、[DECISIONS/0003](DECISIONS/0003-ai-connection.md)。多様さや長さを引数で調整できないので、指示文で調整する前提で設計する。

## L-5 Sign in with ChatGPT の試作で分かったこと（公式文書に無いこと）

- 起きたこと: 公式文書どおりに `GET /v1/models` の `data` を読んだら 0 件だった。実際は `{"models": [...]}` の形で、各要素は `id` ではなく `slug` を持つ。また、`response.completed` の `response.output` が空で、関数ツールの引数を完了イベントから取れなかった。
- 理由: プラン利用の経路の応答は、通常の API キーの Responses API と形が違う（Codex 向けのモデル一覧に近い）。公式文書は細部まで書いていない。
- 対応: モデル一覧は `models`・`slug`・`visibility` で読む。出力は `response.output_text.delta`・`response.output_item.done`・`response.function_call_arguments.done` から組み立てる。事前の承認なしで動的登録と同意まで進めること、`text.format` の JSON Schema（`strict: true`）が使えることも確かめた。詳細は [research §8](research/sign-in-with-chatgpt.md)、決定は [DECISIONS/0003](DECISIONS/0003-ai-connection.md) §5。
- 教訓: プレビューの API は、文書の形を信じて組まず、生の応答を記録する試作で確かめてから設計する。

## L-6 `node:sqlite` でできること

- 分かったこと: Electron 45（Node 24.22.2）と Node 24.12 で、`PRAGMA journal_mode=WAL`、`PRAGMA user_version`、`VACUUM INTO '<path>'`、`backup()`、FTS5 の仮想表、`json_extract`、日本語の `LIKE` が動いた（警告も出ない）。
- 意味: 起動時の控え（`VACUUM INTO`）、スキーマの版の管理（`user_version`）、将来の全文検索（FTS5）まで追加の依存なしでできる。テストも Vitest（Node 24.12）でそのまま `:memory:` の DB を使える。
- 反映: [DECISIONS/0004](DECISIONS/0004-storage-node-sqlite.md)。

## L-7 `node:sqlite` は失敗しても DB を閉じない

- 起きたこと: アプリより新しい版の DB を開くテストで、`openDatabase` がマイグレーションの段階で例外を出した後、テストの後片付けで一時フォルダを消せなかった（EPERM）。
- 理由: `new DatabaseSync(path)` で開いた DB は、その後の処理で例外が起きても閉じられず、Windows ではファイルのロックが残る。
- 対応: `openDatabase` で初期化を `try` で囲み、失敗したら `db.close()` してから投げ直す（`src/main/storage/db.ts`）。本番でも、DB を開けなかった後に控えから戻すなどの操作がファイルのロックで失敗するのを防ぐ。

## L-8 確率のテストはほかの規則と混ぜない

- 起きたこと: 「語数の違うカテゴリでも出方が半々」を `drawSlot` で 1 万回引いて確かめたら 33% になり失敗した。
- 理由: `drawSlot` は直近の語と今の語を避ける（D-3）。1 語だけのカテゴリは 2 回続けて選べないので、規則どおりでも半々にならない。テストの前提が誤っていた。
- 対応: 均等さは除外なしの `drawWord` に対して確かめ、直近の語を避けることは別のテストにした。

## L-9 画面だけをブラウザで開ける形にしておく

- 背景: Electron の画面は自動で操作して確かめにくい。
- 対応: `src/renderer/src/api.ts` で、`window.gameIdeaLab`（preload）が無いときは localStorage に保存する代わりの実装を使うようにし、`npm run dev:browser`（`vite.renderer.config.ts`）で画面だけを開けるようにした。抽選・固定・カテゴリ・手動入力・下書きの復元・保存・テーマをブラウザで操作して確かめた（design/06）。IPC と SQLite のつながりは、ビルドしたアプリを Electron で起動して別に確かめた。
