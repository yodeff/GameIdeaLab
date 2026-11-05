# 公開と配布の手順

配布の形は [DECISIONS/0006](DECISIONS/0006-distribution.md)。公開するかどうか・いつかはメンテナーが決める。

## はじめて公開するとき（1 回だけ）

1. GitHub に `yodeff/game-idea-lab` を作り（空のまま）、このリポジトリを push する。
   名前を変えるなら、`package.json` の `homepage`・`repository`・`bugs`、`README.md`、`SECURITY.md` の URL も直す。
2. リポジトリの設定:
   - **Settings → Pages → Source** を「GitHub Actions」にする（お試し版の置き場）。
   - **Settings → Security → Private vulnerability reporting** を有効にする（`SECURITY.md` の報告の窓口）。
3. CI（`.github/workflows/ci.yml`）が通ることを確かめる。

## 版を出すとき

1. `package.json` の `version` を上げてコミットする（例: `0.1.0`）。`docs/STATE.md` の「最近の変更」も書く。
2. 同じ名前のタグを付けて push する: `git tag v0.1.0` → `git push origin v0.1.0`。
3. **Release** のワークフローが、Windows と Mac（GitHub Actions の Mac の環境）で検査とビルドをして、インストーラーと dmg（Apple Silicon・Intel）を Releases に**下書き**で置く。タグと `version` が違えば止まる。
4. Releases の画面で下書きを確かめ（インストーラーを落として入れてみる）、説明を書いて公開する。
5. お試し版を更新するなら、Actions の **Pages (trial)** を手で走らせる。「デスクトップ版を入手する」は `releases/latest` に向く。

## 手元で作るとき

- インストーラー: `npm run dist:win` → `release/GameIdeaLab-Setup-<版>.exe`
- Mac の dmg: Mac の上で `npm run dist:mac` → `release/GameIdeaLab-<版>-arm64.dmg`・`-x64.dmg`（DECISIONS/0007）
- お試し版: `npm run build:web` → `out/web/`（静的なファイル。どこに置いても動く）
- 配る形のアプリの確かめ: `GIL_APP_EXE="release/win-unpacked/Game Idea Lab.exe" npm run smoke:restart`

## 気をつけること

- 署名をしていないので、初回は SmartScreen（Windows）・Gatekeeper（Mac）の警告が出る（README に書いてある）。
- Mac 版は実機で確かめるまで「試験的」。Mac を持っている人に、起動・抽選・サインイン・生成・保存を確かめてもらう。
- 自動更新は無い。新しい版は入れ直す（保存データはそのまま残る）。
- 公開の前に `npm run check`（公開前の検査を含む）を通す。`private/` は公開しない。
- コミットの作者は GitHub の noreply のアドレス（`<ID>+<アカウント名>@users.noreply.github.com`）。アカウント名は公開される。
