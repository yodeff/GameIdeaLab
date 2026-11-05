# Security Policy / セキュリティについて

## Reporting a vulnerability / 脆弱性の報告

Please report security issues privately through GitHub's **"Report a vulnerability"** button on the [Security tab](https://github.com/yodeff/GameIdeaLab/security/advisories/new). Do not open a public issue for security problems.

脆弱性は、公開の Issue ではなく、GitHub の [Security タブ](https://github.com/yodeff/GameIdeaLab/security/advisories/new) の「Report a vulnerability」から非公開で知らせてください。

We will reply as soon as we can. This is a small hobby project, so fixes may take some time.

## Supported versions / 対象の版

Only the latest release is supported. / 最新の版だけを直します。

## What this app stores / アプリが保存するもの

- Ideas, drafts and settings: a local SQLite file in `%APPDATA%\Game Idea Lab` (Windows) or `~/Library/Application Support/Game Idea Lab` (macOS). Never sent anywhere.
- Sign in with ChatGPT tokens and an optional OpenAI API key: encrypted with the OS (Electron `safeStorage`: DPAPI on Windows, Keychain on macOS) in the same folder.
- The app talks only to OpenAI (`auth.openai.com`, `api.openai.com`) when you use the AI features. Drawing keywords and writing ideas yourself work offline.
- The browser trial version has no AI features and keeps data only in that browser's `localStorage`.

- 案・下書き・設定: `%APPDATA%\Game Idea Lab`（Windows）・`~/Library/Application Support/Game Idea Lab`（Mac）の SQLite ファイル（外へは送りません）。
- Sign in with ChatGPT のトークンと、使う場合の OpenAI の API キー: 同じフォルダに OS の仕組みで暗号化して保存します（Electron の `safeStorage`。Windows では DPAPI、Mac ではキーチェーン）。
- 外と通信するのは AI の機能を使うときの OpenAI（`auth.openai.com`・`api.openai.com`）だけです。抽選と自分で考えるモードはオフラインで動きます。
- ブラウザのお試し版は AI を使えず、データはそのブラウザの `localStorage` にだけ置きます。
