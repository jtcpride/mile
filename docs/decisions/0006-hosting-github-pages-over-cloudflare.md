# 0006: 初回ホスティングをCloudflare PagesからGitHub Pagesへ変更する

- 日付: 2026-07-23
- 状態: 採用

## 判断

構成案で第一の公開先としていたCloudflare Pagesはまだ接続せず、
初回公開先をGitHub Pagesの `jtcpride/mile` プロジェクトサイトへ変更する。
本番ビルドの基底パスを `/mile/` とし、画面内遷移、PWA manifest、
Service Worker も同じスコープ内に閉じる。

## 理由

- 月額費用なしで公開でき、ソースとデプロイ履歴を同じ公開リポジトリで追跡できる。
- すでに接続したGitHubだけで公開まで完結し、Cloudflareアカウントと
  追加の運用境界をv0.1へ持ち込まずに済む。
- BaaS 未設定時も静的デモモードで4画面を検収できる。
- `404.html` にアプリシェルを複製し、詳細URLへの直接アクセスでもルーターを復元できる。

## 影響

GitHub Actions 上のビルドのみ `/mile/` を基底パスにする。
ローカル開発は従来どおり `/` で動作する。
Cloudflare Pagesは代替デプロイ先としてREADMEの手順だけを残す。
