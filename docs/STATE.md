# STATE — Game Idea Lab の現在地

> 作業を始めるエージェントが最初に読む文書。作業の最後に書き換える（AGENTS.md §6）。
> 最終更新: 2026-11-05

## 現在地

- 段階: **STEP 5 抽選と A モード 実装済み** → メンテナーの確認（辞書の抜き取り・触っての感想）待ち。次は STEP 6（AI 連携と B モード。T-11〜T-19）。段階の一覧は [ROADMAP.md](ROADMAP.md)。
- 動くもの: 3 スロットの抽選（カテゴリの複数選択・固定・個別の引き直し・手動入力・キー操作・演出・組み合わせのコピー）、A モード（下書きの自動保存・保存）、テーマの切り替え、作業状態と設定の SQLite への保存、起動時の控え。辞書は 10 カテゴリ 1,025 語・ジャンル 20。
- まだ無いもの: B モード（AI 生成）、保存済みの一覧、Markdown 出力。
- 手で確かめた結果: [design/06-manual-checks.md](design/06-manual-checks.md)。
- STEP 1 の結果: [design/01-requirements.md](design/01-requirements.md)（未確定事項 D-1〜D-23 と初期値の案、リスク R-1〜R-12）。
- STEP 2 の結果: [research/sign-in-with-chatgpt.md](research/sign-in-with-chatgpt.md)（公式仕様の確認）と [DECISIONS/0003](DECISIONS/0003-ai-connection.md)（AI の接続。採用）。
- STEP 4 の結果: [design/05-tasks.md](design/05-tasks.md)（T-01〜T-26、依存関係、メンテナーに手を借りるところ）。タスクの状態の正本はこの表。
- STEP 3 の結果: [design/02-architecture.md](design/02-architecture.md)（構成・IPC・生成の流れ・テスト）、[design/03-screens.md](design/03-screens.md)（画面・操作・誤りの表示）、[design/04-data-and-generation.md](design/04-data-and-generation.md)（抽選・辞書・アイデアの項目・指示文・SQLite・出力・質の評価）、[DECISIONS/0004](DECISIONS/0004-storage-node-sqlite.md)（保存は `node:sqlite`）。
- STEP 2.5 の結果: OSS アプリとして事前の承認なしでサインイン・プラン利用・生成ができた。JSON Schema の構造化出力も使える。3 案で 25〜50 秒（[research §8](research/sign-in-with-chatgpt.md)、LEARNINGS L-5）。

## 次にやること

1. メンテナー: `npm run dev` で触って感想をもらう。辞書（`resources/dictionaries/keywords.ja.json`）を抜き取りで眺めてもらう。
2. STEP 6: AI の部品（T-11 core/idea・T-12 秘密の保管・T-13 サインイン）から始める。

## メンテナーの判断待ち

| ID | 判断すること | 推奨 | 状態 |
|---|---|---|---|
| Q-7 | STEP 5 を触ってみての感想と、辞書（1,025 語）の抜き取りの確認 | — | 未回答 |

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

- 2026-11-05: STEP 5 実装（T-01〜T-10）。テスト 55 件。画面だけをブラウザで開く `npm run dev:browser` を足した。
- 2026-11-05: STEP 4 MVP のタスク分解（T-01〜T-26）。
- 2026-11-05: STEP 3 設計（アーキテクチャ・画面・データと生成）。保存は `node:sqlite` に決めた。
- 2026-11-05: STEP 2.5 Sign in with ChatGPT の試作（`spikes/siwc-probe.mjs`）。サインイン・プラン利用・3 通りの生成を確かめた。
- 2026-11-05: STEP 1（要件の整理）と STEP 2（Sign in with ChatGPT の公式仕様の確認、AI の接続の案）を文書にした。
- 2026-11-05: 公開前提の構成にした（`private/` の分離、公開前の検査 `tools/check-public.mjs`、CI）。著作権者・コミットの作者を yodeff にした。
- 2026-11-05: 初期セットアップ。Electron 45 + electron-vite 6 + React 19 + TypeScript 7 + Vitest 5。企画書を `docs/spec/` に置いた。
