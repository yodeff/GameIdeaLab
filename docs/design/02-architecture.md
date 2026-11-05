# STEP 3 設計 (1) アーキテクチャ

- 作成: 2026-11-05
- 前提: [STEP 1](01-requirements.md)（D-番号の初期値）、[DECISIONS/0001](../DECISIONS/0001-tech-stack.md)・[0003](../DECISIONS/0003-ai-connection.md)・[0004](../DECISIONS/0004-storage-node-sqlite.md)
- 続き: [画面](03-screens.md)、[データと生成](04-data-and-generation.md)

## 1. 全体の形

```text
┌──────────────── renderer（React） ────────────────┐
│ 画面・操作の状態                                    │
│ 抽選（src/core/draw を直接呼ぶ。通信しない）        │
│ 辞書（resources/dictionaries を同梱して読む）       │
└──────────────┬───────────────────────┘
               │ window.gameIdeaLab（preload が公開する API だけ）
┌──────────────▼──────────── main（Node・Electron） ┐
│ ipc/        入力を検査して各サービスへ渡す             │
│ storage/    node:sqlite（アイデア・設定・作業状態）    │
│ secrets/    safeStorage（トークン・API キー）          │
│ auth/       Sign in with ChatGPT（loopback・PKCE・更新） │
│ ai/         IdeaModelClient の実装（プラン・API キー）  │
│ export/     Markdown のファイル保存（ダイアログ）       │
└───────────────────────────────────────┘
        どちらも src/core（純粋な関数）と src/shared（IPC の型）を使う
```

### 1.1 どこで何を動かすか

| 処理 | 置き場 | 理由 |
|---|---|---|
| 抽選 | renderer（`src/core/draw`） | 通信なしで即座に結果を出す（企画書 §16.1）。Web 版でもそのまま動く |
| 辞書の読み込み | renderer（JSON を import して同梱） | 辞書は読むだけ。MVP では編集しない |
| 指示文の組み立て・出力の解析 | `src/core/idea`（呼ぶのは main） | 純粋な関数にしてテストする。Web 版でも使い回す |
| AI への通信・トークン | main だけ | トークンを renderer に渡さない（R-8） |
| 保存 | main（`node:sqlite`） | ファイルに触れるのは main だけ |
| Markdown の組み立て | `src/core/export` | コピー（renderer）とファイル保存（main）で同じ関数を使う |
| クリップボード | renderer（`navigator.clipboard`） | Web 版と同じ書き方にする |

## 2. フォルダ

```text
src/
  core/                       純粋な関数。Electron・React・Node の API を import しない
    dictionary/               辞書の型・検査（今の dictionary.ts を移す）
    draw/                     スロットの設定・抽選・直近の履歴
    idea/                     アイデアの型・方向の配分・指示文・JSON Schema・ストリームの部分解析・派生
    export/                   Markdown・組み合わせの 1 行
    random.ts                 乱数の型（Rng = () => number）
  shared/
    ipc.ts                    IPC の契約（チャンネル名・引数・戻り値の型）
    validate.ts               main が IPC の入力を検査する関数
  main/
    index.ts                  起動・ウィンドウ
    ipc/                      ハンドラー（1 機能 1 ファイル）
    storage/                  db.ts・migrations.ts・ideaRepository.ts・stateRepository.ts・backup.ts
    secrets/                  secretStore.ts（safeStorage + userData/secrets/）
    auth/                     chatgptAuth.ts（loopback・PKCE・ID トークン検査・更新・失効）
    ai/                       client.ts（IdeaModelClient）・chatgptPlanClient.ts・apiKeyClient.ts・responsesStream.ts
    export/                   saveMarkdown.ts
  preload/index.ts
  renderer/src/
    app/                      App・画面の切り替え・全体の状態（useReducer + Context）
    screens/                  MainScreen・SavedScreen・SettingsScreen
    components/               SlotCard・CategoryPicker・DrawButton・ModeSwitch・IdeaCard・IdeaDetail・…
    hooks/                    useDraw・useGeneration・useAutosave・useTheme
    styles/
resources/dictionaries/       keywords.ja.json・genres.ja.json
tests/                        core/・main/（:memory: の DB）
```

1 ファイル 1 関心、目安 300 行。モジュールの外からは各フォルダの `index.ts` を通して使う。

## 3. IPC の契約

renderer に公開する API（`window.gameIdeaLab`）。型は `src/shared/ipc.ts`、入力の検査は main で必ず行う。

| API | 内容 |
|---|---|
| `getAppInfo()` | 名前・版・OS（済） |
| `loadWorkspace()` / `saveWorkspace(ws)` | 作業状態（今の組み合わせ・固定・スロットの設定・モード・A モードの下書き・直近の抽選）を読む・保存する |
| `getSettings()` / `updateSettings(patch)` | 設定（生成数・忠実度・モデル・テーマ・接続方法） |
| `listIdeas(query)` | 保存済み・履歴の一覧（検索語・ジャンル・お気に入り・保存済みか） |
| `getIdea(id)` | 1 件 |
| `saveHumanIdea(input)` | A モードのアイデアを保存 |
| `updateIdea(id, patch)` | 保存する・お気に入り・メモ・タイトル |
| `deleteIdea(id)` | 削除（確認は renderer） |
| `exportMarkdownFile(ids)` | 保存ダイアログを出して Markdown を書く |
| `auth.getStatus()` | 接続方法・サインイン中のアカウント（表示名・メール）・プラン利用の可否 |
| `auth.signIn()` / `auth.signOut()` | Sign in with ChatGPT |
| `auth.setApiKey(key)` / `auth.clearApiKey()` | API キー（Q-4） |
| `ai.listModels()` | 設定で選べるモデル |
| `ai.generate(request)` → `jobId` | 生成を始める。結果は `ai.onEvent` で届く |
| `ai.derive(request)` → `jobId` | 派生生成（Q-5） |
| `ai.cancel(jobId)` | 中止 |
| `ai.onEvent(listener)` → 解除の関数 | `{ jobId, type: 'started' | 'idea' | 'done' | 'error', ... }` |

- renderer はトークン・API キーの値を受け取らない。`setApiKey` は書くだけで、読み出す API は作らない。
- 生成の結果は main が `ideas` 表に「未保存（履歴）」として書いてから `idea` のイベントで送る。アプリを閉じても生成した案は履歴に残る（D-17）。

## 4. 状態の持ち方（renderer）

- 外部の状態管理ライブラリは入れない。`useReducer` + Context で 1 つの `AppState` を持つ。
- `AppState` = 作業状態（`Workspace`）+ 生成中のジョブ + 画面の状態（どの画面・モーダル）+ 設定の写し。
- `Workspace` の変化は 500 ms まとめて `saveWorkspace` に送る（D-9。下書きを失わない）。終了の直前にも送る。
- 抽選は reducer の外で `src/core/draw` を呼び、結果を action として渡す（reducer を純粋に保つ）。

## 5. 生成の流れ

```text
renderer                      main                                   OpenAI
  │ ai.generate(req) ─────────▶ 検査 → 設定・接続を決める
  │ ◀──────── jobId             core/idea で指示文と JSON Schema を作る
  │                             トークンの期限を確かめ、必要なら更新 ──▶ token
  │                             POST /v1/responses（stream）────────▶
  │                             ◀──────────── output_text.delta …
  │                             core/idea の部分解析で 1 案が閉じるたびに
  │ ◀── onEvent(idea) ──────── ideas 表に履歴として保存 → 送る
  │ ◀── onEvent(done/error) ── response.completed / failed / 中断
```

- 同時に走らせる生成は 1 つまで。生成中に新しく始めたら、前のものを中止するか確かめる。
- 中止は `AbortController`。途中まで届いた案は履歴に残し、未完成の案は捨てる。
- 誤りは [調査 §6](../research/sign-in-with-chatgpt.md) の区別で `error.kind` を決めて送る: `not-signed-in`・`plan-not-granted`・`not-eligible`・`usage-limit`・`temporarily-unavailable`・`unsupported`・`auth-failed`・`config-error`・`network`・`incomplete`・`cancelled`。

## 6. Sign in with ChatGPT の実装

[DECISIONS/0003](../DECISIONS/0003-ai-connection.md) と [調査 §3・§5・§8](../research/sign-in-with-chatgpt.md) の手順を `src/main/auth/chatgptAuth.ts` にまとめる。

- 保存するもの（`safeStorage` で暗号化、`userData/secrets/`）: ホスト ID・`client_id`・アクセス・リフレッシュ・ID トークン・期限・付与されたスコープ・表示用のアカウント情報（名前・メール・`sub`）。
- 更新: アクセストークンの期限の 5 分前より後に依頼するときに更新する。更新は 1 つの Promise で直列にする。
- MVP では ChatGPT のアカウントは 1 つだけ（複数のアカウントの切り替えは作らない）。
- サインアウト: 生成を止め、失効を送り、手元を消す。失効を確かめられなければその旨を表示する。

## 7. セキュリティ

- 今の設定（`contextIsolation`・`sandbox`・CSP・外部ページへの遷移の禁止）を保つ。CSP の `connect-src` は `'self'` のまま（renderer は外と通信しない）。
- IPC の入力は `src/shared/validate.ts` で型・長さ・範囲を検査する（例: 生成数 1〜10、キーワード 50 文字まで、メモ 10,000 文字まで）。
- トークン・API キー・AI の応答の全文をログに出さない。
- loopback の受け口は `127.0.0.1`、`state` の照合、1 回で閉じる、5 分で時間切れ（R-9）。
- 外部リンク（「Manage usage」など）は `shell.openExternal` で既定のブラウザに開く。開ける先は `https://` に限る。

## 8. テストの方針

| 対象 | テスト |
|---|---|
| `src/core/draw` | 固定の乱数で、カテゴリの均等・重複の回避・固定・手動入力・空のカテゴリ（D-1〜D-4）。多数回の抽選で偏りが無いこと |
| `src/core/idea` | 方向の配分（D-13）、指示文に忠実度・方向・禁止事項が入ること、JSON Schema、ストリームの部分解析（途中で切れた JSON・複数の案） |
| `src/core/export` | Markdown の形（企画書 §10.2 の項目、メモが無いときは出さない） |
| `src/main/storage` | `:memory:` の DB でマイグレーション・保存・検索・履歴の削除（D-17） |
| `src/main/ai` | 記録した SSE の応答（試作の結果から作る fixture）を流して、イベントと誤りの区別を確かめる。実際の OpenAI には繋がない |
| `src/main/auth` | PKCE・URL の組み立て・コールバックの検査・ID トークンの検査（テスト用の鍵で署名） |
| 画面 | MVP では手で確かめる（STEP 8）。必要になったら Playwright の Electron 対応を検討 |

## 9. Web 版への備え（作らない）

Web 版では main の代わりに「ブラウザの保存（IndexedDB）」と「AI の接続（別の契約。R-10）」を用意し、`window.gameIdeaLab` と同じ型の API をブラウザ側で実装すれば、renderer と `src/core` を使い回せる。MVP ではこのための抽象化を増やさない（企画書 §16.3「将来のために MVP を複雑にしない」）。
