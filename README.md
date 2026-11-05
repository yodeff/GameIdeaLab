# Game Idea Lab

ランダムなキーワード（1〜5 つ）とゲームジャンル（0〜3 つ）を組み合わせて、自分では思いつかなかったゲームアイデアの種を見つけるデスクトップアプリ。

- **A モード**: 組み合わせを見て、自分で発想する（AI 不要・オフライン）
- **B モード**: AI に複数のゲーム案を出させて比べる
- 気に入った案を保存し、Markdown でコピーして外部の AI や開発環境へ持っていく
- 抽選中のガラガラ・決まったときの鐘など、効果音つき（設定で消せます）

> 最初の版を準備中（v0.0.1）。進み具合は [docs/STATE.md](docs/STATE.md)。

## 使い方

### デスクトップ版（Windows）

1. [Releases](https://github.com/yodeff/game-idea-lab/releases/latest) から `GameIdeaLab-Setup-<版>.exe` を入手して実行します。
2. 署名をしていないため、初回は「Windows によって PC が保護されました」と出ます。「詳細情報」→「実行」で進めてください。
3. B モード（AI）は、ChatGPT の Plus・Pro のプランでサインインして使います（「Continue with ChatGPT」）。設定で自分の OpenAI API キーを選ぶこともできます（API の利用料がかかります）。

保存データは `%APPDATA%\Game Idea Lab` にあります。アンインストールしても消えません。

### ブラウザのお試し版

[https://yodeff.github.io/game-idea-lab/](https://yodeff.github.io/game-idea-lab/)（公開後）で、インストールせずに、抽選・自分で考える（A モード）・保存・Markdown での書き出しを試せます。AI の機能はデスクトップ版だけです。データはそのブラウザの中にだけ保存されます。

## English

**Game Idea Lab** is a Windows desktop app that helps you find seeds for game ideas. It randomly combines 1–5 keywords with 0–3 game genres (Japanese word lists).

- **Mode A**: look at the combination and come up with an idea yourself (offline, no AI).
- **Mode B**: let AI (Sign in with ChatGPT, or your own OpenAI API key) suggest several game ideas and compare them.
- Save ideas, mark favorites, and export them as Markdown.
- A browser trial version (no AI) is also available.

The UI and word lists are in Japanese. Download the installer from [Releases](https://github.com/yodeff/game-idea-lab/releases/latest) (unsigned, so Windows SmartScreen will warn you on first run). See [SECURITY.md](SECURITY.md) for what the app stores and how to report vulnerabilities.

## 開発

必要なもの: Node.js 24.12 以上、Windows

```bash
npm install
npm run dev
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発モードで起動（ホットリロード） |
| `npm run dev:browser` | 画面だけをブラウザで開く（http://127.0.0.1:5180。保存は localStorage） |
| `npm run check` | 型検査・テスト・公開前の検査 |
| `npm run build` | `out/` にビルド |
| `npm run dist:win` | Windows のインストーラーを `release/` に作る（NSIS・署名なし。DECISIONS/0006） |
| `npm run build:web` | ブラウザのお試し版（AI なし）を `out/web/` に作る。入手先のリンクは `VITE_DOWNLOAD_URL` で渡す |
| `npm run smoke:restart` | 起動・操作・終了（強制終了を含む）を繰り返して DB の健全さを確かめる。一時フォルダの保存先を使う |
| `npm run preview` | ビルドしたものを起動 |
| `npm run eval:ideas` | 生成の質の評価（開発用。アプリでサインインした接続で 10 通りを生成し `private/eval/` に書く） |

## 文書

| 文書 | 中身 |
|---|---|
| [docs/spec/game-idea-lab-v0.1.md](docs/spec/game-idea-lab-v0.1.md) | 企画・要件定義（正本） |
| [docs/STATE.md](docs/STATE.md) | 現在地・次にやること・未決事項 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 開発の段階（STEP 1〜8） |
| [docs/LEARNINGS.md](docs/LEARNINGS.md) | 開発で分かったこと |
| [docs/design/](docs/design/) | 要件の整理・設計 |
| [docs/research/](docs/research/) | 外部の仕様の調査 |
| [docs/DECISIONS/](docs/DECISIONS/) | 設計判断の記録 |
| [docs/RELEASING.md](docs/RELEASING.md) | 公開と配布の手順 |
| [SECURITY.md](SECURITY.md) | 保存するもの・脆弱性の報告 |
| [AGENTS.md](AGENTS.md) | AI エージェント向けの作業規約 |

## ライセンス

[MIT](LICENSE) © yodeff
