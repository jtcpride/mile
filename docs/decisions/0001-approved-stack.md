# 0001: v0.1の技術スタック

- 状態: 承認済み
- 日付: 2026-07-23

## 決定

公開面はVite、Vanilla TypeScript、MapLibre GL JS、Supabase、Cloudflare
Pagesを基本構成とする。

実行時依存は `maplibre-gl` と `@supabase/supabase-js` に限定する。
ルーター、状態管理、画像圧縮、UIフレームワークは追加しない。

## 理由

v0.1は4画面だけであり、ブラウザ標準APIで十分実装できる。依存を
減らすことで、月額0円構成、長期保守、BaaS乗り換えのしやすさを優先する。

## 影響

- 画面遷移はHistory APIを使用する。
- 画像縮小はCanvas APIで実施する。
- PWA manifestとService Workerは小さく自前実装する。
- アプリコードはSupabase SDKをdata-access層以外から参照しない。

