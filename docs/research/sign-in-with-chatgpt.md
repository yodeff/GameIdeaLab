# STEP 2 Sign in with ChatGPT の公式仕様の確認

- 確認日: 2026-11-05
- 出典: OpenAI の公式文書（§7）。文書はプレビュー段階の機能を説明しており、変わりうる。実装の前と配布の前に読み直す。
- 企画書 §13.3 の確認項目ごとに、分かったことと分からなかったことを分けて書く。推測で埋めない。

## 1. 全体像

- Sign in with ChatGPT には「本人確認（サインイン）」と「ChatGPT プランの利用」の 2 つがある。プランの利用は任意の追加機能で、利用者が別に同意する。
- 連携の形は 3 つ: Web サイト、ChatGPT のプラグイン、**オープンソースのアプリ**。Game Idea Lab はオープンソースでローカルで動くアプリなので、3 つ目の「ChatGPT plan usage（token sharing for open-source）」の流れに当たる。
- この流れでは、利用者は API キーを入力せずに自分の ChatGPT プランで Responses API の対象の依頼を実行できる。アプリ側にクライアントシークレットも提携企業用の API キーも要らない。
- プランの利用は会話の履歴など、ほかのアカウント情報へのアクセスを与えない。
- 有料のアプリ・リモートで動かすアプリは、別の申し込み（interest form）の対象とされている。

## 2. 確認項目ごとの結果

| 企画書 §13.3 の項目 | 分かったこと | 分からなかったこと |
|---|---|---|
| OSS アプリの適格性 | オープンソース・ローカルで動くアプリ向けの文書がある。クイックスタートには「プランの利用はすべてのオープンソースのパートナーと一部の非公開クライアントが使える」とある | 「オープンソース」の定義（ライセンスの条件など）。OSS アプリに事前の承認・提携が要るか → **試作では事前の承認なしで同意まで進めた**（§8） |
| アプリ登録要件 | OSS の流れはサインインのときに動的に登録する（`client_id=dynamic_agent_client` で始め、コールバックで `oaiapp_…` の形の `client_id` が発行される）。発行された ID は利用者とワークスペースに結び付き、アプリが保存して次から使う | 「Request a client ID」のページは Web サイト向けの提携の待機リストの案内で、OSS の流れに当てはまるかは書かれていない |
| OAuth / PKCE の仕様 | OpenID Connect + PKCE（S256）。`state`・`nonce` を毎回作る。受け口は `http://127.0.0.1:<ポート>/<パス>` の loopback（`localhost` は使わない。ポートは変わってよいが、スキーム・ホスト・パスは変えない）。受け口はブラウザを開く前に起動する（§3） | 独自 URI スキーム・デバイスコードの流れは書かれていない |
| ChatGPT プラン利用の許可フロー | スコープ `resource.invoke chatgpt.tokens.use.direct` を含めて同意を求める。付与されたスコープに `chatgpt.tokens.use.direct` が無ければプラン利用は無効。ID トークンが正しくてもプラン利用の許可にはならない | — |
| 対応アカウント・プラン | クイックスタートに「対象の ChatGPT Plus・Pro の利用者」とある | 無料・Business・Enterprise・Edu の扱い。地域の制限（403 で地域の制限が返りうるとだけ書かれている） |
| 対応する API とモデル | `POST https://api.openai.com/v1/responses` と `GET https://api.openai.com/v1/models`。モデルは固定の一覧が無く、アカウントのモデル一覧（`visibility == "list"`）から選ぶ。文書の例は `gpt-6.1-sol` | 構造化出力（JSON Schema）が使えるか → **試作で使えた**（§8） |
| 利用制限 | 依頼の制約は §4。利用量の上限を超えると 429（`subscription_sharing_usage_limit_exceeded`） | 上限の量・回復の時刻（推測しないよう指示されている） |
| 必須リクエストパラメータ | `store: false`・`stream: true`・`input` は配列。認証は `Authorization: Bearer <access_token>` だけ | — |
| トークン保管・更新・失効 | §5 | — |
| 配布に関する条件 | 文書には見当たらない | 配布・ブランド表示・禁止される使い方の条件。OpenAI の一般の利用規約との関係 |

## 3. サインインの手順（ローカルアプリ）

公開の OpenID の設定（`https://auth.openai.com/.well-known/openid-configuration`）と文書から。

| 項目 | 値 |
|---|---|
| issuer | `https://auth.openai.com` |
| 認可 | `https://auth.openai.com/api/accounts/authorize`（システムのブラウザで開く） |
| トークン | `https://auth.openai.com/api/accounts/oauth/token` |
| 失効 | `https://auth.openai.com/api/accounts/oauth/revoke` |
| JWKS | `https://auth.openai.com/.well-known/jwks.json` |
| スコープ | `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` |
| resource | `https://api.openai.com/v1` |

1. **ホスト ID を用意する**: `ext_agent_host_id` は必須。インストールごとに 1 回作って保存し、使い回す。形式は `urn:uuid:<UUIDv4>`（または公開鍵から作る `urn:ietf:params:oauth:jwk-thumbprint:…`・`did:key:…`）。メールアドレスなど利用者を特定できる値は使わない。認証情報ではない。
2. **受け口を起動する**: `127.0.0.1` の空いているポートで HTTP を待ち受ける。
3. **ブラウザを開く**: 認可の URL に `client_id`（初回は `dynamic_agent_client`、2 回目からは保存した ID）、`agent_name_hint`（初回だけ。アプリ名）、`ext_agent_host_id`、`response_type=code`、`redirect_uri`、`scope`、`resource`、`state`、`nonce`、`code_challenge_method=S256`、`code_challenge` を付ける。再認可では `id_token_hint`・`login_hint` を付けてもよい。
4. **コールバックを受ける**: `code`・`state`・`scope`・（初回は）`client_id` が届く。`state` を検査する。`error=access_denied` なら `state` を検査してやめる。
5. **コードを交換する**: トークンのエンドポイントへフォーム形式で `grant_type=authorization_code`・`client_id`・`code`・`code_verifier`・`redirect_uri`・`resource` を送る。`invalid_grant` ならコードを捨てて最初からやり直す。
6. **ID トークンを検査する**: JWKS で署名、issuer・audience（発行された `client_id`）・期限・`nonce` を確かめる。`sub` をアカウントの識別子にする。付与されたスコープに `chatgpt.tokens.use.direct` があるかを確かめる。

## 4. 生成の依頼の制約（プラン利用の経路）

- `store: false`・`stream: true` が必須。結果はストリームで受け、`response.completed` が来たときだけ成功とする。`response.failed`・`response.incomplete`・途切れたストリームを別々に扱う。
- `input` は配列。システムの指示は `instructions` か developer のメッセージに入れる（`role: "system"` のメッセージは拒否される）。
- 指定できない引数: `temperature`・`top_p`・`max_output_tokens`・`metadata`・`user`・`truncation`・`prompt` など。
- `previous_response_id` は使えない。続きの依頼（派生生成など）は必要な文脈を毎回 `input` に入れ直す。
- ツール: 関数ツール・カスタムツールは使える。画像生成・ファイル検索・Code Interpreter・ホストされた MCP などは使えない。
- 公式の SDK の例は再試行を切っている（`max_retries=0`）。再試行はアプリが誤りの種類を見て決める（§6）。

## 5. トークン

- アクセストークンの期限は 1 時間（`expires_in: 3600`）。`offline_access` があればリフレッシュトークンが発行され、期限は 30 日。更新のたびに新しいリフレッシュトークンに置き換わる（ローテーション）。アクセストークン・期限・スコープ・リフレッシュトークンをまとめて置き換える。
- 更新は `grant_type=refresh_token`。同じセッションの更新は同時に走らせない（ローテーションと競合する）。
- 保管: アクセス・リフレッシュ・ID トークンは保護されたローカルの保管場所に置く。ブラウザの保管場所・ソース管理・ログ・分析・サポートのやり取りに入れない。URL に入れない。
- サインアウト: 依頼を止め、失効のエンドポイントでリフレッシュトークンを失効させ、手元のトークンを消す。失効を確かめられなかったときは手元を消したうえで、ChatGPT の設定から接続を切れることを利用者に伝える。
- 利用者が ChatGPT の設定で接続を切っても、アプリには通知されない。依頼か更新の失敗で分かったら、そのトークンを使うのをやめて再サインインを求める。一時的な失敗でトークンを消さない。
- 複数のアカウントを持てる。アカウントごとに `client_id`・トークンを分け、混ぜない。設定かアカウントのメニューに、使っている ChatGPT のアカウントを表示する。

## 6. 誤りと回復（企画書 §13.5 との対応）

| 企画書の区別 | 公式の誤り | 回復の仕方（公式の指示） |
|---|---|---|
| ログイン失敗 | `access_denied`、`invalid_grant`、ID トークンの検査の失敗 | やり直しを案内する |
| 同意したがプラン利用が無い | スコープに `chatgpt.tokens.use.direct` が無い | サインインは保ち、プラン利用を無効と表示する。利用者が選んだときだけ全スコープで再認可 |
| 利用枠超過 | 429 `subscription_sharing_usage_limit_exceeded`（ストリームの途中の `response.failed` でも来る） | 新しい依頼を止め、「Manage usage」（chatgpt.com/settings/usage）へ案内する。回復の時刻を推測しない |
| 対象外のアカウント | 403 `subscription_sharing_user_not_eligible` | 理由を説明する。繰り返さない・サインインを繰り返させない |
| 通信失敗・一時的に使えない | 503 `subscription_sharing_usage_unavailable`・`subscription_sharing_user_unavailable`、受け付け前の 503 | トークンを保ち、回数を限って間隔を空けて再試行 |
| モデル利用不可・未対応の指定 | 400 `subscription_sharing_unsupported_capability`（`error.param` に原因） | 原因の指定を外す。同じ内容で再試行しない |
| 認証の失敗 | 401 `subscription_sharing_invalid_user` | 原因を調べる。失効が確かなときか更新が回復できない失敗のときだけ再サインイン |
| 更新の失敗 | `invalid_grant`・`invalid_refresh_token`・`token_expired`・`refresh_token_expired`・`refresh_token_invalidated`・`refresh_token_reused` | トークンを消し、保存した `client_id` でサインインし直す |
| 設定の誤り | `invalid_client`、403 `chatpass_v2_scope_not_authorized`・`chatpass_v2_invalid_authorization_context`、`subscription_sharing_route_not_supported` | 設定を直す。再試行しない・課金の方法を変えない |
| 生成中断 | `response.incomplete`、ストリームの途切れ、利用者の中止 | 途中までの結果は「未完成」として扱い、成功にしない |

公式の文書は、プラン利用が無いときに「利用者自身の API キーなど別の支払い方法を提示する」ことを例に挙げている。企画書 §13.5 に従い、利用者の明示の選択なしには切り替えない（設計判断の案は [DECISIONS/0003](../DECISIONS/0003-ai-connection.md)）。

## 7. 表示の決まり（UI/UX ガイドライン）

- サインインのボタンの文言は「Continue with ChatGPT」。承認された書式のボタンを使う。
- プラン利用を有効にして初めてサインインしたときだけ、プランを使うことと ChatGPT の設定で管理できることを説明する（見出し「You're using your ChatGPT plan」、操作「Got it」）。
- プランを使って依頼するときは、入力欄かモデルの選択の近くに「Using ChatGPT plan」と「Manage usage」（chatgpt.com/settings/usage）を出す。
- 利用枠超過のときは「Manage usage」を主な操作にする。
- アプリ自身の課金とプランの利用を区別して見せる（Game Idea Lab は自身の課金を持たない）。
- 日本語の画面での文言（英語の決まり文句を訳してよいか）は文書に書かれていない。試作で確かめるまで英語の決まり文句をそのまま使う案とする。

## 8. 試作で確かめたこと（2026-11-05、`spikes/siwc-probe.mjs`）

メンテナーの ChatGPT アカウントで 2 回実行した（1 回目は新規登録、2 回目は保存した `client_id` での再認可）。

| 確かめたこと | 結果 |
|---|---|
| OSS アプリに事前の承認が要るか | 要らなかった。`client_id=dynamic_agent_client` で始めると、コールバックで `oaiapp_…` の `client_id` が発行された。2 回目は保存した ID で再認可でき、新しい ID は発行されなかった |
| プラン利用の同意 | 付与されたスコープは `chatgpt.tokens.use.direct email offline_access openid profile resource.invoke`（要求どおり） |
| トークンの応答 | `access_token`・`refresh_token`・`id_token`・`expires_in`（3600）・`earliest_refresh_at`・`scope`・`token_type` |
| ID トークンの検査 | RS256。JWKS での署名・issuer・audience（発行された `client_id`）・期限・`nonce` がすべて通った。主張に `sub`・`email`・`name`・`sid` などがある |
| モデル一覧 | `GET /v1/models` は `{"models": [...]}` の形で返る（`data` ではない）。各要素は `id` ではなく `slug` を持ち、`visibility` がある。10 件中 `visibility == "list"` は 8 件（`gpt-6.1-sol`・`gpt-6-astra`・`gpt-6.1-terra`・`gpt-6-sol`・`gpt-6-luna`・`gpt-5.6-sol`・`gpt-5.6-terra`・`gpt-5.6-luna`）。Codex 向けの設定らしき項目（`apply_patch_tool_type` など）も含まれる |
| 生成（文章） | 成功。`gpt-6.1-sol` で 3 案、最初の出力まで約 11 秒、全体で約 24 秒 |
| 生成（`text.format` の JSON Schema、`strict: true`） | 成功。スキーマどおりの JSON で 3 案が届いた。最初の出力まで約 17 秒、全体で約 49 秒 |
| 生成（関数ツール、`tool_choice: "required"`） | 成功（`response.function_call_arguments.delta`・`.done` が届いた）。最初の出力まで約 3 秒、全体で約 39 秒。引数の中身は台本の不備で記録できなかった（直した） |
| 完了イベント | `response.completed` の `response.output` は空だった。出力はストリームの途中のイベント（`response.output_text.delta`・`response.output_item.done`・`response.function_call_arguments.done`）から組み立てる必要がある |
| 利用量 | `usage` に `input_tokens`・`output_tokens`・`total_tokens` と `attribution` がある |
| サインアウト | 失効のエンドポイントにリフレッシュトークンを送ると HTTP 200（本文は空） |

- 時間は 1 回ずつの計測で、ばらつきは分からない。3 案で 25〜50 秒かかるので、生成中の表示と、届いた案から順に出すことが体験に効く。
- 出力の質: 3 案とも「寄生」を宿主の体力・発覚・移動経路などのルールに反映し、方向（王道・変化球・実験的）もはっきり分かれた。指示文は台本の `INSTRUCTIONS` の 4 文だけ。

## 9. 出典

- https://developers.openai.com/siwc
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/request-client-id
- https://developers.openai.com/siwc/ui-ux-guidelines
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/token-reference
- https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://auth.openai.com/.well-known/openid-configuration

未読: Codex app-server・Self-hosted VMs のページ（Game Idea Lab は HTTP で Responses を直接呼ぶので使わない見込み）、アカウントのセキュリティ通知のページ。
