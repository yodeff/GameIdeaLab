# STEP 3 設計 (3) データと生成

- 作成: 2026-11-05
- 前提: [STEP 1](01-requirements.md)、[アーキテクチャ](02-architecture.md)、[DECISIONS/0003](../DECISIONS/0003-ai-connection.md)・[0004](../DECISIONS/0004-storage-node-sqlite.md)
- 型の名前は実装の目安。細部は実装で決めてよいが、項目の意味は変えない。

## 1. 抽選

### 1.1 型

```ts
// 2026-11-05 にスロットを可変にした（DECISIONS/0005）。ジャンル 0〜3（初期 1）、キーワード 1〜5（初期 2）
type SlotKind = 'genre' | 'keyword'
type Slot = {
  id: string                                         // 'g1'・'k2' など。種類ごとの連番
  kind: SlotKind
  value: string
  source: 'draw' | 'manual'
  categoryId: string | null                          // 手動入力なら null
  locked: boolean
  categoryIds: string[]                              // 空 = すべて（D-1）
  history: string[]                                  // このスロットの直近 20 語（D-3）
}
type DrawState = { slots: Slot[] }                   // ジャンルが左、キーワードが右の順に並ぶ
type Combination = { genres: string[]; keywords: string[] }
type Rng = () => number                              // [0, 1)。テストでは固定の列
```

### 1.2 手順（`src/core/draw`）

1 つのスロットを引くとき:

1. 候補のカテゴリ = スロットで選んだカテゴリ（空ならすべて）のうち、単語が 1 つ以上あるもの（D-2）。0 なら「すべて」に戻す。
2. 除く語 = 同じ種類のほかのスロットの語（必須、D-3）＋ このスロットの直近 20 語（努力目標）。
3. カテゴリを均等に選び、その中から除く語以外を均等に選ぶ（企画書 §5.6）。選んだカテゴリに残りが無ければ、残りのある候補のカテゴリから選び直す。
4. それでも無ければ直近の除外をやめ、同じ種類のほかのスロットの語だけを除いて選ぶ。
5. 結果を返し、直近の履歴の先頭に足す（20 を超えたら古いものを捨てる）。

一括抽選は固定していないスロットを左から順に引く（後のスロットは先に引いた同じ種類の語を除く）。ジャンルのスロットはキーワードとは別の辞書を使い、重複の除外は同じ種類の中だけ。

スロットを足すと、同じ種類の並びの右端に入り、すぐに引く。上限・下限を超える足し外しは何もしない。ジャンルが 0 のときは「ジャンル自由」で、AI にはキーワードに合うジャンルを選ばせる（§3.3 の `combinationLines`）。ジャンルが 2 つ以上なら掛け合わせる。

将来の「単語単位の均等」（企画書 §5.6）は、手順 3 の重みを差し替えるだけで足せるよう、選び方を関数として渡せる形にしておく（MVP では作らない）。

### 1.3 辞書

#### 形

今の `KeywordDictionary` を使う。ジャンルの辞書は親カテゴリを `categories` にする（D-6）。

| 親カテゴリ（id） | ジャンル |
|---|---|
| アクション系（`action`） | アクション、メトロイドヴァニア、ステルス、レース、リズムゲーム |
| 物語・探索系（`story`） | RPG、アドベンチャー、脱出ゲーム、ホラー |
| 思考・戦略系（`strategy`） | パズル、ストラテジー、タワーディフェンス、デッキ構築、オートバトラー、ローグライク |
| 経営・育成系（`management`） | シミュレーション、経営シミュレーション、育成ゲーム |
| 創造・生存系（`sandbox`） | サンドボックス、サバイバルクラフト |

「その他」は入れない（D-5）。ジャンルは MVP の後に足してよい（カテゴリを増やせる形なので画面は変わらない）。

#### 一般キーワードの量と集め方（U-2）

- 目安: 10 カテゴリそれぞれ 100 語（最低 60 語）、合計 1,000 語前後。2026-11-05 にメンテナーの希望（「もっと増やしたい」「最近の語句も入れたい」）で、各カテゴリ約 200 語に増やし、「流行・ネット語」（`trend`、約 150 語）を足した。合計 2,370 語。流行語の線引きは `resources/dictionaries/README.md`。
- 1 語は 1〜10 文字程度の日本語。名詞か名詞化した動作（「寄生」「収穫」）。
- 入れない: 固有名詞・商標・作品名・実在の人物、差別的な語、性的な語。似すぎた語の並び（「猫」と「子猫」）は片方にする。
- 集め方: カテゴリごとに候補を作り（AI で下書きしてよい。既存の単語集は写さない。AGENTS.md §2）、重複・長さをテストで検査し、メンテナーが抜き取りで眺める。STEP 5 で行う。

## 2. 作業状態（Workspace）

```ts
type Workspace = {
  mode: 'human' | 'ai'
  version: 2
  draw: DrawState                                    // スロットのカテゴリと直近の語も Slot の中に持つ
  draft: { title: string; body: string; startedWith: Combination | null; updatedAt: string }
  lastGeneration: { jobId: string; combination: Combination; ideaIds: string[] } | null
}
```

`workspace` 表に JSON で 1 行だけ保存する（§4）。`lastGeneration` は持たず、起動時に履歴から最後の生成とその派生を読み直す（`latestGeneration`、2026-11-05）。形を変えるときは `version` を上げ、読み込みで古い形を新しい形に直す（版 1 の 3 スロットは `g1`・`k1`・`k2` に直す）。

## 3. アイデア

### 3.1 AI の案の項目（企画書 §7.3）

| 項目（JSON のキー） | 必須 | 内容 |
|---|---|---|
| `direction` | ○ | 王道・変化球・実験的（派生案は元の方向を引き継ぐ） |
| `title` | ○ | ゲームタイトル（仮） |
| `problem` | ○ | 課題。この組み合わせとジャンルで立てた問い（版 3 で追加） |
| `concept` | ○ | 一言コンセプト（1 文） |
| `overview` | ○ | ゲームの概要（2〜3 文） |
| `player_actions` | ○ | プレイヤーが行う操作 |
| `goal` | ○ | ゲームの目的 |
| `core_choice` | ○ | プレイヤーが毎回迷う選択（指示文の版 2 で追加） |
| `risk_return` | ○ | リスクとリターン。何を冒すほど何が得られるか（版 2 で追加） |
| `core_loop` | ○ | コアループ。障害 → 解消 → 報酬 → 強化や進展 の順 |
| `fun_core` | ○ | 面白さの核。どこで緊張がたまり、どこで解き放たれるか |
| `keyword_mechanics` | ○ | キーワードとゲーム性の関係 |
| `features` | 任意 | 特徴的なシステム |
| `challenges` | 任意 | 予想される課題 |
| `prototype` | 任意 | 簡単な試作イメージ |

ゲームジャンル・使用キーワードは AI に書かせず、依頼した組み合わせをアプリが付ける（AI が勝手に置き換えないため。企画書 §3.3）。

JSON Schema（`strict: true`）では任意の項目も `required` に入れ、型を `["string", "null"]` にする（strict はすべての項目の列挙を求めるため）。`additionalProperties: false`。

### 3.2 方向の配分（D-13）

`directionsFor(n)`: 王道 → 変化球 → 実験的 の順に繰り返す。1 案 = 王道、2 案 = 王道・変化球、5 案 = 王道・変化球・実験的・王道・変化球。

### 3.3 指示文（`src/core/idea/prompts.ts`）

> 版 2〜4（2026-11-05）で、ゲーム性を「リスクとリターンの駆け引き」、面白さを「緊張をためて解き放つ流れ」、コンセプトを「課題 → 解き方」として書かせる形に変え、実験的の「変える軸」をアプリが乱数で割り当てるようにした（`planIdeas`）。考え方は YouTube「桜井政博のゲーム作るには」のまとめ動画（ゲーム性・企画・ゲーム設計・企画コンセプト）を要約したもの（LEARNINGS L-15）。下の 1〜8 は版 1 の骨組みで、版 2 でも保っている。正本は `prompts.ts`。

`instructions`（developer の指示）に入れること:

1. 役割: ゲームデザイナーとして、2 つのキーワードとジャンルから遊びとして成立するアイデアを考える。
2. 重視すること（企画書 §3.4・§7.4）: 操作・目的・判断・ルール・コアループを具体的に書く。世界観や物語の設定だけで終えない。
3. キーワードの扱い: 関連の薄い組み合わせを自然な組み合わせに置き換えない。名前や飾りだけに使わない。
4. 忠実度（§7.5）: 厳格 = 両方をメカニクスの中心に／標準 = 少なくとも片方をメカニクスに、もう片方は設定や体験でもよい／自由 = 連想した概念への飛躍を許す。
5. 方向の意味（§7.2）と、各案の方向の割り当て。案同士をはっきり違うものにする。
6. 避けること: ありがちな RPG・ホラーへの安易な収束、既存作品の単純な組み合わせ、既存作品の名前を出すこと。
7. 分量: 各項目 1〜3 文。1 案を 30 秒で読める長さ（`max_output_tokens` が使えないため文章で指示する。R-3）。
8. 日本語で書く（D-15）。

`input` には組み合わせと案の数だけを入れる。A モードの下書きは入れない（D-12）。

### 3.4 派生（Q-5、企画書 §8）

- 1 回の依頼で 1 案を返す。`input` に元の案の全項目（JSON）と操作を入れる（`previous_response_id` は使えないため。調査 §4）。
- 操作ごとの指示: もっと独創的に／ゲーム性を強く（判断・ルール・コアループを強める）／もっとシンプルに（ルールを減らす）／別のジャンルで（ジャンルの辞書から今と違うものを 1 つ引いて渡す。画面で選び直せる）／自由に指示（利用者の文、500 文字まで）。
- 派生案は新しいアイデア。`parent_id` に元の ID、`derivation` に操作を入れる。元は書き換えない。

### 3.5 ストリームの部分解析

`output_text.delta` で JSON が少しずつ届く。`src/core/idea/partialIdeas.ts` は届いた文字列を前から読み、文字列の中かどうかと括弧の深さを追って、`ideas` の配列の要素が閉じるたびにその 1 案を取り出す。取り出した案はスキーマで検査し、通らなければその案だけを「壊れた案」として捨てる（全体は止めない）。

## 4. SQLite のスキーマ（版 1）

```sql
CREATE TABLE ideas (
  id               TEXT PRIMARY KEY,           -- UUID
  created_at       TEXT NOT NULL,              -- ISO 8601
  updated_at       TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('human', 'ai')),
  saved            INTEGER NOT NULL DEFAULT 0, -- 0 = 履歴、1 = 保存済み
  favorite         INTEGER NOT NULL DEFAULT 0,
  title            TEXT NOT NULL,
  concept          TEXT NOT NULL DEFAULT '',
  keyword1         TEXT NOT NULL,              -- 版 1 の列。版 2 からは先頭の語を入れて残すだけ
  keyword2         TEXT NOT NULL,
  genre            TEXT NOT NULL,
  keywords         TEXT NOT NULL DEFAULT '[]', -- 版 2（2026-11-05）。キーワードの JSON 配列
  genres           TEXT NOT NULL DEFAULT '[]', -- 版 2。ジャンルの JSON 配列（空 = ジャンル自由）
  body_text        TEXT NOT NULL DEFAULT '',   -- A モードの本文。AI の案は検索用に全項目をつないだ文
  body_json        TEXT,                       -- AI の案の項目（§3.1）。A モードは NULL
  direction        TEXT,                       -- 王道・変化球・実験的
  memo             TEXT NOT NULL DEFAULT '',
  parent_id        TEXT REFERENCES ideas(id) ON DELETE SET NULL,
  derivation       TEXT,                       -- 派生の操作
  generation_id    TEXT,                       -- 同じ依頼で生まれた案のまとまり
  model            TEXT,
  fidelity         TEXT,                       -- strict・standard・free
  draw_context     TEXT                        -- 抽選の条件（スロットのカテゴリ）の JSON
);
CREATE INDEX ideas_saved_created ON ideas (saved, created_at DESC);
CREATE INDEX ideas_genre ON ideas (genre);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- 値は JSON
CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, value TEXT NOT NULL);
```

- 履歴の削除（D-17）: 未保存（`saved = 0`）の案を新しい順に 200 件残す。生成が終わるたびに 1 回。派生の元として参照されていても消してよい（`parent_id` は NULL になる）。
- 検索（D-18）: MVP は `title`・`keywords`・`genres`・`body_text`・`memo` の `LIKE`。ジャンルでの絞り込みは `json_each(genres)` で 1 つでも一致すれば出す。件数が増えて遅くなったら FTS5 に替える（使えることは確かめた。DECISIONS/0004）。
- お気に入りは保存済みでなくても付けられる。お気に入りを付けたら自動で保存済みにする（お気に入りが履歴の削除で消えないように）。

### 設定の項目（`settings`）

| key | 値の例 | 初期値 |
|---|---|---|
| `ai.connection` | `"chatgpt"` / `"apiKey"` | `"chatgpt"` |
| `ai.model` | `"gpt-6.1-sol"` | 一覧にあれば `gpt-6.1-sol` |
| `ai.count` | `3` | 3 |
| `ai.fidelity` | `"standard"` | `"standard"` |
| `ui.theme` | `"system"` / `"light"` / `"dark"` | `"system"` |
| `ui.planNoticeShown` | `true` | `false` |
| `window.bounds` | `{x,y,width,height}` | 1280×820 |

トークン・API キー・`client_id`・ホスト ID は DB に入れない（`safeStorage`、アーキテクチャ §6）。

## 5. 出力

### 5.1 組み合わせのコピー（D-8）

```text
自動販売機 × 寄生 × 経営シミュレーション
```

### 5.2 Markdown（企画書 §10.2）

```markdown
# 寄生自販機チェーン

- キーワード: 自動販売機 / 寄生
- ジャンル: 経営シミュレーション

## コンセプト
（concept）

## 概要
（overview）

## プレイヤーの操作
（player_actions）

## 目的
（goal）

## コアループ
（core_loop）

## 面白さの核
（fun_core）

## キーワードとゲーム性
（keyword_mechanics）

## メモ
（memo。空なら節ごと出さない）
```

- 任意の項目（特徴的なシステム・課題・試作イメージ）は値があるときだけ「## 面白さの核」の後に出す。
- A モードの案は「## 内容」に本文をそのまま入れる。
- 説明文・前置き・AI 向けの依頼文は付けない（企画書 §10.3）。複数の案は `---` でつなぐ。
- 発想モード・方向・作成日時は出さない（外部へ渡すときに要らない情報を足さない）。

## 6. 生成の質の評価（R-5）

指示文を変えるたびに、同じ組み合わせで出力を見比べる。

- 評価用の組み合わせ 10 通りを `tests/fixtures/eval-combinations.json` に置く（意味の近いもの 3、遠いもの 5、抽象語を含むもの 2）。
- `tools/eval-ideas.mjs`（STEP 6）が、サインインした接続で全組み合わせを生成し、`private/eval/<日時>.md` に並べて書く。
- 見る点: キーワードがルールに入っているか、方向が分かれているか、ありがちな型に寄っていないか、操作が具体的か、30 秒で読めるか。気づいたことは LEARNINGS に残す。
