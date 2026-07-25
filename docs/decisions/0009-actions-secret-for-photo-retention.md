# 0009: 写真削除専用SecretをActions Secretsに置く

- 状態: 発注者承認済み
- 日付: 2026-07-25

## 背景

当初は、公開リポジトリに関連する場所へ `service_role` 相当の鍵を置かない
方針だった。一方、非公開写真を確認時刻から90日で削除するには、回答行の
参照とStorage objectの削除を定期実行するサーバー側資格情報が必要になる。

発注者は、制約を次のように改訂することを明示的に承認した。

- GitHub Actions Secretsへの保存は許可する。
- ソース、公開環境変数、文書、ログ、チャットへの保存・表示は禁止する。

制約を緩和した事実と理由も公開履歴へ残す。

## 調査結果

SupabaseのSecret keyは、組み込みの `service_role` Postgres roleとして動作し、
プロジェクトデータへ広い権限を持ちRLSを迂回する。Secret key自体を
特定bucketの削除だけに限定する機能はない。

独自role用JWTをGitHub Actionsで生成する案は、JWT署名secretを外部へ置く
必要があり、そのsecretから他roleのtokenも生成できるため採用しない。

参考:

- [Supabase: Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Storage: Custom Roles](https://supabase.com/docs/guides/storage/schema/custom-roles)

## 決定

写真削除ジョブ専用に、新しいSupabase Secret keyを1本発行する。値は
GitHub ActionsのRepository Secret
`SUPABASE_PHOTO_PURGE_SECRET_KEY` だけに保存する。

Project URLは秘密ではないため、既存のActions variable
`VITE_SUPABASE_URL` を再利用する。Secret keyをActions variable、
Pagesビルド、ブラウザ、ソース、文書、ログへ渡さない。

キー自体のbucket単位スコープは実現できないため、実行コード側に次の
最小化を強制する。

- bucketを非公開 `answer-photos` に固定する。
- `answers` の直接権限は付与せず、写真保持専用の2つのDB関数だけを
  `service_role` から実行可能にする。
- DBサーバー時刻で `confirmed_at` が90日より古く、`photo_url` が
  非NULLの回答だけを取得する。
- object pathが `匿名UUID/ミッションUUID/写真UUID.拡張子` と完全一致する
  候補だけを許可する。
- 不正な候補が1件でもあれば、削除前にジョブを失敗させる。
- 手動実行はdry-runを既定値とし、件数だけを出す。
- 写真path、回答ID、匿名ID、鍵をログへ出さない。
- 同時実行を禁止し、1回1000件を上限とする。

## 検証条件

1. Secret未設定時は削除せず終了理由を表示する。
2. 手動dry-runは対象件数だけを表示し、Storageと回答行を変更しない。
3. 90日より古い検証用写真だけが削除され、回答行の `photo_url` が
   `null` になる。
4. 90日未満の写真はobjectと `photo_url` の両方が残る。
5. Secret値がリポジトリ、Actions variables、ログに現れない。
6. `service_role` に `answers` の直接SELECT・UPDATE権限を付与しない。

## 影響と残余リスク

Secret keyが漏えいした場合の権限は写真削除だけには限定されない。
専用keyにすることで個別失効を可能にし、Actions Secrets以外へ出さないこと、
ジョブの入力・対象・ログを限定することでリスクを抑える。

漏えいの疑いがある場合は、この専用keyだけを直ちに削除し、新しいkeyへ
入れ替える。

## 2026-07-25 本番検証

- Secret登録名だけを確認し、値は取得・表示しなかった。
- 初回dry-runは `answers` の直接SELECT拒否で削除0件のまま停止した。
- 直接権限を追加せず、写真保持専用2関数のEXECUTEだけを付与した。
- 対象なしdry-runが成功した。
- 91日前の検証用写真1件を用意し、dry-runが1件を検出して削除しないことを確認した。
- 実行時は同じ1件だけを削除し、Storage objectと回答の写真参照が消えた。
- 90日未満の実回答はStorage objectと回答の写真参照がともに残った。
- 検証用回答とミッションを削除し、実回答には触れていない。
- Actionsログ内のSecret値はすべて `***` としてマスクされた。

検証run:

- [対象1件のdry-run](https://github.com/jtcpride/mile/actions/runs/30162416797)
- [対象1件の実削除](https://github.com/jtcpride/mile/actions/runs/30162455697)
