# 0008: 公開ミッションだけにData API読取権限を付与する

- 状態: 採用
- 日付: 2026-07-25

## 決定

`public.missions` に限り、`anon` と `authenticated` へPostgresの
`SELECT` 権限を付与する。取得可能な行は既存RLSで次のすべてを満たすものに
限定する。

- `visibility = 'public'`
- `status = 'active'`
- `expires_at > now()`

`public.answers` には直接の `SELECT` / `INSERT` 権限を付与しない。
回答送信は引き続き `submit_answer` RPCだけを通す。

## 理由

RLSポリシーは取得可能な行を制限するが、テーブル自体のPostgres権限を
代替しない。実SupabaseのData API検証で、RLS評価前に
`permission denied for table missions` となることを確認した。

公開面に必要な最小の読取権限だけを付与し、`limited`、期限切れ、下書き、
回答データを公開しない境界はDB側に維持する。
