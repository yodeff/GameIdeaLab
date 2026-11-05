# Game Idea Lab

ランダムなキーワード（1〜5 つ）とゲームジャンル（0〜3 つ）を組み合わせて、自分では思いつかなかったゲームアイデアの種を見つけるデスクトップアプリ。

- **A モード**: 組み合わせを見て、自分で発想する（AI 不要・オフライン）
- **B モード**: AI に複数のゲーム案を出させて比べる
- 気に入った案を保存し、Markdown でコピーして外部の AI や開発環境へ持っていく

> 開発中（v0.0.1、初期セットアップ段階）。進み具合は [docs/STATE.md](docs/STATE.md)。

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
| [AGENTS.md](AGENTS.md) | AI エージェント向けの作業規約 |

## ライセンス

[MIT](LICENSE) © yodeff
