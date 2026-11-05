# 0001: 技術構成と雛形

- 状態: 採用（2026-11-05。企画書 §12.2・§17 の推奨どおり）
- 関連: 企画書 §12、LEARNINGS L-1〜L-3

## Context

企画書は Electron + React + TypeScript + Vite + SQLite + ローカル JSON 辞書を推奨し、将来の Web 版への移植を考慮するよう求めている（§12.2）。

## Decision

- **Electron 45 + electron-vite 6**: main・preload・renderer を 1 つの設定でビルドする。Vite 8 の開発サーバーでホットリロードできる。
- **React 19 + TypeScript 7（strict）**。テストは **Vitest 5**。
- **層の分け方**: ドメインロジックは `src/core` に純粋な関数として置き、Electron・React・Node に依存させない。Web 版では `src/main` の代わりにブラウザ側の保存・AI 呼び出しを用意すれば `src/core` と `src/renderer` を使い回せる。
- **IPC**: renderer へ公開する機能は `src/shared/ipc.ts` の型に列挙し、preload はその型どおりにだけ `contextBridge` で公開する。
- **セキュリティ**: `contextIsolation: true`・`nodeIntegration: false`・`sandbox: true`・CSP、外部 URL は既定のブラウザで開きアプリ内で遷移させない（§12.4）。
- **辞書**: `resources/dictionaries/*.json`。形式は `src/core/dictionary.ts` の `KeywordDictionary`。重複の検査はテストで行う。
- **保存（SQLite）**: 実装方法は STEP 3 で決める（STATE U-1）。

## Alternatives

- **Tauri**: 軽いが、企画書の推奨と異なり、Rust の層が増える。採らない。
- **electron-forge**: パッケージングまで含むが、Vite との統合は electron-vite のほうが素直。配布の形（STEP 8）で electron-builder などを別に選ぶ。
- **UI ライブラリ（MUI・shadcn など）**: 今は入れない。画面が少ないので素の CSS で始め、必要になったら判断する。

## Consequences

- `npm run check`（型検査 + テスト）を変更の終わりに必ず通す。
- 配布用のインストーラーは STEP 8 で選ぶ（まだ依存に入れていない）。
