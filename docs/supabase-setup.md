# Supabase作成・接続手順

## 1. 発注者が行う作業

1. <https://supabase.com/dashboard> を開き、Supabaseアカウントを作成または
   サインインする。
2. **New project** を選ぶ。
3. 所有するOrganizationを選び、次を目安に入力する。
   - Project name: `mairu-v01`
   - Database password: パスワード管理アプリで生成・保存する
   - Region: 利用者に最も近い日本またはアジア地域
   - Plan: Free
4. **Create new project** を実行し、Dashboardが利用可能になるまで待つ。
5. プロジェクトが開けたらCodexへ「Supabaseプロジェクト作成済み」と伝える。

Database password、Secret key、`service_role` keyはチャットへ貼らない。
アカウント作成時のCAPTCHA、利用規約同意、メール確認、2要素認証は
発注者本人が行う。

## 2. 作成後にCodexが進める作業

- SQL Editorで初期migrationと架空寺社seedを適用する。
- Anonymous Sign-Insを有効にする。
- RLS、回答RPC、非公開Storage bucketを検査する。
- Project URLとPublishable keyをGitHub Actions variablesへ登録する。
- 静的デモ表示が消え、実Supabaseの公開ミッションだけが表示されることを確認する。
- 匿名回答、サーバー確認時刻、1端末1ミッション1回答、任意写真を実機検証する。

Dashboard操作をCodexへ任せる場合は、ログイン済みのブラウザを開いた状態で
知らせる。アカウントのパスワードやDatabase passwordをCodexへ渡す必要はない。

## 3. 接続に使う値

ブラウザへ渡してよい値は次の2つだけ。

- `VITE_SUPABASE_URL`: **Integrations → Data API** のProject URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: **Connect** または
  **Settings → API Keys** の `sb_publishable_...`

どちらも公開クライアント用の値だが、ソースへ直書きせずGitHubの
**Settings → Secrets and variables → Actions → Variables** に登録する。
Pagesのビルドはこの2値が揃ったときだけSupabaseモードになる。

写真削除ジョブには別途Secret keyが必要になる。これはブラウザへ渡さず、
GitHub Actionsの**Secrets**へ発注者またはCodexがDashboardから直接登録する。

## 4. 初期SQL

適用順は次のとおり。

1. `supabase/migrations/202607230001_initial_schema.sql`
2. `supabase/seed.sql`

初期SQLは、次をまとめて作成する。

- `missions` と `answers`
- 公開・進行中・期限内ミッションだけを読めるRLS
- サーバー時刻と匿名IDを確定する `submit_answer` RPC
- 1匿名ユーザー・1ミッション・1回答の一意制約
- 非公開 `answer-photos` bucketと本人用Storage policy

## 5. 安全確認

- `service_role`、Secret key、Database passwordを公開リポジトリへ入れない。
- Publishable keyはRLSを迂回しないが、全テーブルでRLSを確認する。
- Anonymous Sign-Inは匿名ユーザー行を作るため、初期公開後に
  Turnstile導入と古い匿名ユーザーの定期削除を検討する。
- Freeプラン休止を避けるため、運営は週1回以上アクセスして
  ミッション登録と期限確認を行う。
