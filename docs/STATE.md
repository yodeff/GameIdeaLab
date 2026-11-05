# STATE — Game Idea Lab の現在地

> 作業を始めるエージェントが最初に読む文書。作業の最後に書き換える（AGENTS.md §6）。
> 最終更新: 2026-11-05

## 現在地

- 段階: **STEP 0 初期セットアップ 完了** → 次は STEP 1（要件の整理）。段階の一覧は [ROADMAP.md](ROADMAP.md)。
- 動くもの: Electron の空の画面（3 つのスロットの枠だけ）。preload 経由の IPC、型検査、テスト、公開前の検査が通る。
- まだ無いもの: 抽選、A/B モード、AI 生成、保存、エクスポート。

## 次にやること

1. STEP 1: 企画書から未確定事項と実装上のリスクを抜き出し、この文書の「未決事項」に整理する。
2. STEP 2: Sign in with ChatGPT の最新の公式仕様（https://developers.openai.com/siwc/quickstart ほか）を確かめ、実装方法と制約を `docs/DECISIONS/` にまとめる。
3. STEP 3: 画面構成・データモデル・主要コンポーネントを設計する（保存は `node:sqlite` を第一候補として検討。LEARNINGS L-3）。

## メンテナーの判断待ち

| ID | 判断すること | 推奨 | 状態 |
|---|---|---|---|
| — | なし | — | — |

## 決まったこと

| ID | 内容 | 日付 |
|---|---|---|
| Q-1 | 著作権者は yodeff（LICENSE・`package.json` の author） | 2026-11-05 |
| Q-2 | 最終的に OSS として公開する。時期はメンテナーが決める。公開前提の構成にする（[DECISIONS/0002](DECISIONS/0002-public-repository-layout.md)） | 2026-11-05 |
| Q-3 | コミットの作者名は yodeff、メールアドレスは GitHub の noreply（このリポジトリの git config だけに設定） | 2026-11-05 |

## 未決事項（設計・実装）

| ID | 内容 | 決める段階 |
|---|---|---|
| U-1 | 保存の実装（`node:sqlite` か `better-sqlite3` か） | STEP 3 |
| U-2 | 初期辞書の語数の目安（カテゴリごと何語か）と、語の集め方（自前で選ぶ。AGENTS.md §2） | STEP 3〜5 |
| U-3 | ジャンルに親カテゴリの階層を設けるか（企画書 §5.4。初期 UI を複雑にしない） | STEP 3 |
| U-4 | AI 連携の実装方法（Sign in with ChatGPT の可否により変わる） | STEP 2 |
| U-5 | 配布の形（インストーラーの種類、コード署名の有無） | STEP 8 |

## 最近の変更

- 2026-11-05: 公開前提の構成にした（`private/` の分離、公開前の検査 `tools/check-public.mjs`、CI）。著作権者を yodeff にした。
- 2026-11-05: 初期セットアップ。Electron 45 + electron-vite 6 + React 19 + TypeScript 7 + Vitest 5。企画書を `docs/spec/` に置いた。
