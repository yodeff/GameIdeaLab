# 0003: AI の接続（Sign in with ChatGPT とその代わり）

- 状態: **採用**（2026-11-05。Q-4「API キーも入れる」・Q-6「試作する」はメンテナーが推奨どおりと判断。試作の結果で §5 を足した）
- 関連: 企画書 §13、[STEP 2 の調査](../research/sign-in-with-chatgpt.md)、[STEP 1](../design/01-requirements.md) の R-1〜R-4・R-8・R-9

## Context

- 企画書は Sign in with ChatGPT を第一候補とし、API キーを入力しない体験を目指す。ただしサインインとプランの利用は別の概念で、ログインできてもプランを使えるとは限らない（§13.2）。
- 公式文書には、オープンソースでローカルで動くアプリ向けの流れ（動的なクライアント登録 + loopback の OAuth + PKCE）があり、クライアントシークレットなしでプランを使える。ただしプレビューで、OSS アプリに承認が要るか、構造化出力が使えるかは書かれていない。
- プランを使えるのは Plus・Pro の利用者（公式の案内）。

## Decision（案）

### 1. 接続を差し替えられる形にする

`src/core` に AI の接続の型（インターフェース）を置き、生成の手順（指示文の組み立て・結果の解析・方向の配分）は接続の種類に依存させない。

```ts
// 形のイメージ。STEP 3 で確定する
type IdeaModelClient = {
  listModels(): Promise<ModelInfo[]>
  generate(request: GenerateRequest, signal: AbortSignal): AsyncIterable<GenerateEvent>
}
```

接続の実装は main プロセスに置く。renderer には「生成を始める・中止する・状態を受け取る」だけを IPC で公開し、トークンも API キーも渡さない。

### 2. 第一の接続: Sign in with ChatGPT（プラン利用）

- ホスト ID は初回起動で `urn:uuid:<UUIDv4>` を作って保存する。
- サインインは main プロセスが `127.0.0.1` の空いたポートで受け口を開き、システムのブラウザで認可の URL を開く。受け口のパスは `/auth/callback` で固定。`state`・`nonce`・PKCE を検査し、1 回受けたら閉じる。5 分で時間切れ。
- `agent_name_hint` は `Game Idea Lab`。
- トークン（アクセス・リフレッシュ・ID）と `client_id` は Electron の `safeStorage`（Windows では DPAPI）で暗号化して、アプリのデータフォルダに保存する。ログに出さない。SQLite には入れない。
- 更新はアクセストークンの期限の前に 1 か所でまとめて行う（同時に更新しない）。
- 生成は `POST https://api.openai.com/v1/responses` に `store: false`・`stream: true` で送る。`temperature` などは送らない。多様さと長さは指示文で調整する。
- 誤りは調査 §6 の区別で画面に出す（企画書 §13.5 の 5 区別に「対象外のアカウント」「設定の誤り」を足す）。
- 表示は公式の UI/UX ガイドラインに従う（「Continue with ChatGPT」、プラン利用中の「Using ChatGPT plan」と「Manage usage」）。

### 3. 第二の接続: 利用者自身の OpenAI API キー（Q-4 で採用）

- 設定で利用者が明示的に選んだときだけ使い、「利用料は自分の OpenAI アカウントに課金される」と画面に書く。
- Sign in with ChatGPT が使えないとき（対象外・利用枠超過・未承認）に**自動で切り替えない**（企画書 §13.5）。誤りの画面で「API キーを使う」を選択肢として出すところまでにする。
- API キーも `safeStorage` で暗号化して保存する。

### 4. 確かめてから設計を確定すること（Q-6）

STEP 3 の前に、main プロセスだけの小さな試作で次を確かめる。メンテナーが自分の ChatGPT アカウントでサインインする。

1. OSS アプリとして、事前の承認なしに動的登録とプラン利用の同意まで進めるか。
2. モデル一覧に何が出るか（`visibility == "list"`）。
3. 関数ツール、または `text.format` の JSON Schema で、案を項目ごとに受け取れるか。
4. 3 案の生成にかかる時間と、ストリームの届き方。

試作のコードは `spikes/`（公開してよい形で書く）に置き、結果は LEARNINGS に残す。トークンはどこにも書き出さない。

## 5. 試作の結果で決めたこと（[調査](../research/sign-in-with-chatgpt.md) §8）

- **OSS アプリとして事前の承認なしで使える**ことを確かめた。この方式で実装する。
- **案の受け取り方は `text.format` の JSON Schema（`strict: true`）を第一にする。** スキーマどおりの JSON が届き、文章の解析が要らない。届いた文字列を少しずつ読み、1 案が閉じたらカードを出す。関数ツールも動いたので、JSON Schema が使えなくなったときの代わりにする。
- **出力はストリームのイベントから組み立てる。** `response.completed` の `response.output` は空で届く。
- **モデル一覧は `models` の配列、識別子は `slug`。** `visibility == "list"` のものだけを設定の選択肢に出す。初期値は `gpt-6.1-sol`（一覧に無ければ一覧の先頭）。
- 3 案で 25〜50 秒かかる。生成中の表示（企画書 §11.4）と中止の操作を最初から作る。

## Alternatives

- **API キーだけにする**: 実装は簡単だが、企画書の「API キーを入力しない体験」に反し、利用者に課金の準備を求める。
- **Codex app-server を経由する**: 公式文書にある別の経路。Codex の実行環境を同梱・起動する必要があり、アイデア生成には重い。採らない。
- **ChatGPT の `backend-api` を直接呼ぶ**: 公式文書が明示的に禁じている。採らない。

## Consequences

- B モードは、Plus・Pro の利用者（または API キーを選んだ利用者）だけが使える。A モード・抽選・保存・出力はサインインなしで使える（企画書 §13.4）。
- プレビューの仕様が変わったときの修正は、main プロセスの接続の実装と調査の文書の更新で済む。
- Web 版では、この loopback の流れは使えない。Web 版の AI の接続は別に検討する（STEP 1 の R-10）。
