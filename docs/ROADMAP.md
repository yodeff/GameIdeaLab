# ROADMAP — 開発の段階

企画書 §19 の順に進める。各段階の終わりで STATE.md を更新し、メンテナーに報告する。

| STEP | 内容 | 状態 |
|---|---|---|
| 0 | 初期セットアップ（雛形・文書・公開前提の構成） | 完了 2026-11-05 |
| 1 | 要件を整理し、未確定事項と実装上のリスクを抜き出す（[design/01-requirements.md](design/01-requirements.md)） | 完了 2026-11-05 |
| 2 | Sign in with ChatGPT の最新仕様を公式情報で確かめ、実装方法と制約を整理する（[research/sign-in-with-chatgpt.md](research/sign-in-with-chatgpt.md)・[DECISIONS/0003](DECISIONS/0003-ai-connection.md)） | 完了 2026-11-05（文書。試作は Q-6 次第） |
| 2.5 | Sign in with ChatGPT の試作（サインインして 1 回生成。承認の要否・モデル・構造化出力を確かめる。[research §8](research/sign-in-with-chatgpt.md)） | 完了 2026-11-05 |
| 3 | アーキテクチャ・画面構成・データモデル・主要コンポーネントの設計（[design/02](design/02-architecture.md)・[03](design/03-screens.md)・[04](design/04-data-and-generation.md)） | 完了 2026-11-05 |
| 4 | MVP の機能を実装できるタスクに分け、依存関係を整理する（[design/05-tasks.md](design/05-tasks.md)） | 完了 2026-11-05 |
| 5 | キーワード抽選と A モードを実装し、AI なしで基本動作を確かめる（T-01〜T-10） | 未着手 |
| 6 | AI 連携を足し、B モードでアイデアを生成・表示する（T-11〜T-19） | 未着手 |
| 7 | 保存・コピー・Markdown 出力（T-20〜T-23） | 未着手 |
| 8 | 全体の検証。Windows アプリとして配布できる形にする（インストーラー、依存のライセンス表記、公開の準備。DECISIONS/0002。T-24〜T-26） | 未着手 |

## MVP（v0.1）の範囲

企画書 §15 の 13 項目。v0.2 以降の候補（派生案の充実・プリセット・辞書の編集画面など）は MVP の後に優先順位を決める。
