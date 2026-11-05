# 0002: 公開を前提にしたリポジトリの構成

- 状態: 採用（2026-11-05、メンテナー「最終的には公開するのでその前提でフォルダ構成とかするようにしてほしい」）
- 関連: 企画書 §16.4、AGENTS.md §2

## Context

- Game Idea Lab は MIT ライセンスの OSS として yodeff から公開する。公開の時期はメンテナーが決める。
- 開発中は、メンテナーの環境の外部ツールが進み具合と学びを読みに来る。その連携の設定や環境のパスは、公開リポジトリに入れるものではない。
- 公開してから履歴を消すのは難しい。最初のコミットから「公開して困らないものだけ」を入れる。

## Decision

### 置き分け

| 置き場 | 入れるもの | git |
|---|---|---|
| リポジトリ（`src/`・`docs/` など） | コード、企画書、設計判断、技術的な学び、進み具合。だれが読んでもよい内容 | ○ |
| `private/` | メンテナーの環境のパス、外部ツールとの連携、公開前の内部の判断メモ、環境だけに関わる学び | ×（`.gitignore`） |
| `.env` | 実行時の秘密の設定（OAuth・API キーなど）。見本だけ `.env.example` に置く | × |

- `docs/LEARNINGS.md` は公開する。ライブラリの挙動など、ほかの開発者にも役立つ学びを書く。
- `private/NOTES.md` は git 管理外なので履歴が残らない。消えて困る判断は、公開してよい形に書き直して `docs/` に残す。

### 公開前の検査

`tools/check-public.mjs` を `npm run check` に含める。git に入る予定のファイル（`git ls-files --cached --others --exclude-standard`）を読み、次を見つけたら失敗にする。

- Windows の個人の場所を指す絶対パス（ドライブ文字に続く `Users`・`Develop`・`Agent` のフォルダ）
- メールアドレス（GitHub の noreply を除く）
- `private/public-check.json`（git 管理外）に書いた語。外部ツールの名前など、公開したくない語をメンテナーが足す

### 公開に向けて置いておくもの

- `LICENSE`（MIT、yodeff）、`README.md`、`.github/workflows/ci.yml`（Windows で `npm run check`）。
- 公開の直前に足すもの（STEP 8）: 配布物に同梱する依存のライセンス表記、`SECURITY.md`、英語の README の要約、リポジトリの URL（`package.json` の `repository`）。

## Alternatives

- **内部の文書を別のリポジトリに置く**: 履歴は残るが、作業のたびに 2 か所を行き来する。今は `private/` で足りる。困ったら `private/` を独立した git にする。
- **公開の直前に履歴を整理する**: 作業が重く、見落としの危険がある。採らない。

## Consequences

- エージェントは `docs/` に個人の環境のことを書けない。書くときは `private/` に分ける。
- コミットの作者情報（名前・メールアドレス）も公開される。このリポジトリでは `git config`（リポジトリだけ）で作者名を yodeff、メールアドレスを GitHub の noreply にした（2026-11-05）。GitHub の Organization はコミット用のメールアドレスを持てないため、メールアドレスはメンテナーの個人アカウントの noreply を使う。clone し直したときは設定し直す。
