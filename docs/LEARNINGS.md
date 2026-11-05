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
