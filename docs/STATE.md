# STATE — Game Idea Lab の現在地

> 作業を始めるエージェントが最初に読む文書。作業の最後に書き換える（AGENTS.md §6）。
> 最終更新: 2026-11-05

## 現在地

- 段階: **STEP 3 設計 完了** → 次は STEP 4（MVP のタスク分解）。段階の一覧は [ROADMAP.md](ROADMAP.md)。
- 動くもの: Electron の空の画面（3 つのスロットの枠だけ）。preload 経由の IPC、型検査、テスト、公開前の検査。
- まだ無いもの: 抽選、A/B モード、AI 生成、保存、エクスポート。
- STEP 1 の結果: [design/01-requirements.md](design/01-requirements.md)（未確定事項 D-1〜D-23 と初期値の案、リスク R-1〜R-12）。
- STEP 2 の結果: [research/sign-in-with-chatgpt.md](research/sign-in-with-chatgpt.md)（公式仕様の確認）と [DECISIONS/0003](DECISIONS/0003-ai-connection.md)（AI の接続。採用）。
- STEP 3 の結果: [design/02-architecture.md](design/02-architecture.md)（構成・IPC・生成の流れ・テスト）、[design/03-screens.md](design/03-screens.md)（画面・操作・誤りの表示）、[design/04-data-and-generation.md](design/04-data-and-generation.md)（抽選・辞書・アイデアの項目・指示文・SQLite・出力・質の評価）、[DECISIONS/0004](DECISIONS/0004-storage-node-sqlite.md)（保存は `node:sqlite`）。
- STEP 2.5 の結果: OSS アプリとして事前の承認なしでサインイン・プラン利用・生成ができた。JSON Schema の構造化出力も使える。3 案で 25〜50 秒（[research §8](research/sign-in-with-chatgpt.md)、LEARNINGS L-5）。

## 次にやること

1. STEP 4: MVP の機能を実装できるタスクに分け、依存関係を整理する（design/02〜04 を元にする）。
2. STEP 5: 抽選と A モードの実装（辞書の 1,000 語の作成を含む）。

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
| Q-4 | AI の接続に利用者自身の OpenAI API キーも入れる。設定で明示的に選んだときだけ使い、課金されることを表示する。自動で切り替えない | 2026-11-05 |
| Q-5 | 派生生成の最小の形（固定の 4 操作 + 自由指示、元の案は上書きしない）を MVP に入れる | 2026-11-05 |
| Q-6 | STEP 3 の前に Sign in with ChatGPT の試作をする | 2026-11-05 |

## 未決事項（設計・実装）

| ID | 内容 | 決める段階 |
|---|---|---|
| U-1 | ~~保存の実装~~ → `node:sqlite`（DECISIONS/0004） | 済 |
| U-2 | ~~辞書の語数と集め方~~ → 各カテゴリ 100 語（最低 60）、AI で下書き・検査・メンテナーの抜き取り（design/04 §1.3）。作るのは STEP 5 | 済（方針） |
| U-3 | ~~ジャンルの階層~~ → 親カテゴリ 5 つ（design/04 §1.3） | 済 |
| U-4 | ~~AI 連携の実装方法~~ → DECISIONS/0003 で決定（2026-11-05） | 済 |
| U-5 | 配布の形（インストーラーの種類、コード署名の有無）。リスク R-11 | STEP 8 |
| U-6 | ~~AI の案を項目ごとに受け取る方法~~ → JSON Schema（`strict: true`）を第一、関数ツールを代わりに（DECISIONS/0003 §5） | 済 |
| U-7 | Sign in with ChatGPT の配布の条件・利用規約（公式文書に見当たらない） | 公開の前 |

## 最近の変更

- 2026-11-05: STEP 3 設計（アーキテクチャ・画面・データと生成）。保存は `node:sqlite` に決めた。
- 2026-11-05: STEP 2.5 Sign in with ChatGPT の試作（`spikes/siwc-probe.mjs`）。サインイン・プラン利用・3 通りの生成を確かめた。
- 2026-11-05: STEP 1（要件の整理）と STEP 2（Sign in with ChatGPT の公式仕様の確認、AI の接続の案）を文書にした。
- 2026-11-05: 公開前提の構成にした（`private/` の分離、公開前の検査 `tools/check-public.mjs`、CI）。著作権者・コミットの作者を yodeff にした。
- 2026-11-05: 初期セットアップ。Electron 45 + electron-vite 6 + React 19 + TypeScript 7 + Vitest 5。企画書を `docs/spec/` に置いた。
