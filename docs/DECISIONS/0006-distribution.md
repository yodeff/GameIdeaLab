# 0006: 配布の形は「デスクトップ版のインストーラー」と「ブラウザのお試し版（AI なし）」

- 状態: 採用（2026-11-05、STEP 8 T-25）
- 関連: STATE の U-5・Q-14、STEP 1 のリスク R-11、DECISIONS/0003、research/sign-in-with-chatgpt.md

## Context

配布の形（U-5）を決める段で、メンテナーから「ブラウザで使えないかな？」と聞かれた。調べた結果:

- OpenAI の API（`api.openai.com`）とトークンのエンドポイント（`auth.openai.com`）は、どの Origin からの呼び出しも許している（CORS `*`）。
- しかし Sign in with ChatGPT の OSS の流れは、サインインの後の戻り先が `http://127.0.0.1:<ポート>` だけで、トークンをブラウザの保管場所に置いてはいけない（research §2・§6）。Web サイトからのサインインは別の提携の枠（待機リスト）。
- ブラウザで AI を使うなら利用者の API キーだけになり、キーをブラウザに保存することになる。
- 抽選・A モード・保存・Markdown は、画面だけで動く代わりの実装（localStorage）が既にある。

## Decision

1. **デスクトップ版（本命）**: electron-builder の NSIS インストーラー。利用者ごとにインストール（管理者の権限は要らない）、インストール先を選べる、デスクトップとスタートメニューにショートカット。コード署名はしない（初回に SmartScreen の警告が出る。R-11）。`npm run dist:win` で `release/GameIdeaLab-Setup-<版>.exe` ができる。
2. **ブラウザのお試し版**: 画面だけを静的なファイルにする（`npm run build:web` → `out/web/`）。AI は使えず、B モードには「デスクトップ版の機能です」と入手先を出す（入手先はビルドのときに `VITE_DOWNLOAD_URL` で渡す）。データはそのブラウザの中だけ。偽の AI（`?mock-ai`）は開発時だけ動く。
3. 配るものにライセンスの表記を入れる: `LICENSE` と、同梱された他者のコードの表記 `THIRD_PARTY_NOTICES.md`（`tools/gen-notices.mjs` がビルドの出力から作る）。Electron と Chromium の表記は electron-builder が入れる。
4. アイコンは `tools/make-icon.py` で作る（`build/icon.ico`・`build/icon.png`・`src/renderer/public/favicon.png`）。

## Alternatives

- ブラウザ版でも API キーで AI を使えるようにする: 技術的にはできるが、キーをブラウザに置くことになる。お試し版の役目（触ってみる）には要らない。要望があれば足す。
- ポータブル版（インストール不要の exe 1 つ）: メンテナーはインストーラーを選んだ。後から electron-builder の `portable` を足せる。
- コード署名: 費用がかかる。利用者が増えて警告が問題になったら考える。

## Consequences

- お試し版をどこに置くか（GitHub Pages など）と、デスクトップ版の入手先（GitHub Releases など）は公開のとき（T-26）に決める。
- 自動更新は無い。新しい版は入手先から入れ直す。
- 配ったアプリでも `GIL_USER_DATA` で保存先を変えられる（確かめのため。保存先が変わるだけ）。
