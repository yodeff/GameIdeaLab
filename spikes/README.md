# spikes — 試作

本体に組み込まない、確かめるための小さな台本。結果は `docs/LEARNINGS.md` と関係する設計判断に書き写す。

| 台本 | 確かめること | 関連 |
|---|---|---|
| `siwc-probe.mjs` | Sign in with ChatGPT（OSS 向けの流れ）でサインインし、モデル一覧と 3 通りの受け取り方（文章・JSON Schema・関数ツール）で生成できるか | [DECISIONS/0003](../docs/DECISIONS/0003-ai-connection.md) §4 |

```bash
node spikes/siwc-probe.mjs            # モデルは gpt-6.1-sol（無ければ一覧の先頭）
node spikes/siwc-probe.mjs <モデル名>
```

- ブラウザで自分の ChatGPT アカウントにサインインする必要がある（Plus・Pro）。
- トークンはメモリにだけ置き、最後に失効させる。ホスト ID・発行された `client_id`・結果は `private/` に書く（git 管理外）。
