# Safety Check Reliable Architecture (v2)

## 1. 目的

安否確認が不安定になる根本原因を排除する。

現行の不安定要因:
- LIFFクライアントから script.google.com へ直接アクセスしている
- CORS/認証状態/LINE内WebViewの制約に挙動が左右される
- URLクエリ(sid)に依存し、LIFFリダイレクト時に欠落しやすい
- 失敗時の責務分離がなく、原因切り分けが難しい

目標:
- クライアントは自社APIのみを呼ぶ
- GAS/Spreadsheetアクセスはサーバー側のみ
- sid欠落を防ぐリンク方式に変更
- 監視・再試行・冪等性を標準化

---

## 2. 推奨アーキテクチャ

### 2.1 構成

- LIFFフロント: GitHub Pages (既存)
- API Gateway: Cloud Run / Cloud Functions / Cloudflare Workers のいずれか
- Data Layer: GAS standalone (既存) もしくは Sheets API

推奨フロー:
1. LIFFページは API Gateway のみ呼ぶ
2. API Gateway でLINEトークン検証、sid検証、リクエスト監査
3. API Gateway から GAS (server-to-server) へ POST
4. GASはシート入出力のみ担当

クライアントから script.google.com を直接叩かないことが最重要。

---

## 3. API設計 (Gateway)

ベースURL例:
- https://api.example.com/v1/safetycheck

エンドポイント:
- POST /open
- POST /register
- POST /submit
- GET /health

### 3.1 POST /open

Request:
- surveyToken: string
- lineIdToken: string (LIFF getIDToken)
- requestId: string (UUID)

Response:
- status: registered | unregistered
- surveyId
- title
- userName
- groupName
- registerRequired: boolean

### 3.2 POST /register

Request:
- surveyToken
- lineIdToken
- name
- group
- requestId

Response:
- status: success | error
- message

### 3.3 POST /submit

Request:
- surveyToken
- lineIdToken
- answerStatus
- remarks
- requestId

Response:
- status: success | error
- responseId

---

## 4. sid欠落対策: surveyToken方式

sidをURLに生で置くのをやめる。

surveyToken仕様:
- payload: sid, iat, exp
- 署名: HMAC-SHA256
- 期限: 24時間

URL例:
- https://liff.line.me/<liffId>?surveyToken=<token>

効果:
- LIFF遷移でsidが欠落しても復元可能
- sid改ざん防止
- 期限切れ運用が可能

---

## 5. 認証・認可

### 5.1 クライアント -> Gateway

- LIFF getIDToken を送信
- GatewayでLINE verify APIを呼び、sub(userId)を取得
- 以降の業務キーは server-side の userId を使用

### 5.2 Gateway -> GAS

- GAS Web Appは一般公開しない
- 代替案:
  - Execution APIを利用
  - もしくはGAS専用シークレットヘッダ(X-Internal-Secret)で制限

---

## 6. 冪等性・再送制御

重複投稿防止:
- クライアントが requestId(UUID) を毎回送る
- Gatewayは requestId + userId + action を短期保存
- 同一キーは同一レスポンスを返す

タイムアウト対策:
- Gatewayで最大2回の指数バックオフ再試行
- クライアントは1回のみ再送

---

## 7. ログ・監視

必須ログ:
- requestId
- action
- userId(hash)
- surveyId
- status
- latencyMs
- upstreamStatus (GAS)

監視:
- /health で依存疎通確認
- 5xx率アラート
- p95遅延アラート

---

## 8. 現行との差分

現行:
- safetycheck/index.html -> GAS(JSONP)

新設計:
- safetycheck/index.html -> Gateway(JSON/POST)
- Gateway -> GAS(内部通信)

安定性が上がる理由:
- WebView依存の外部スクリプト読み込みを排除
- CORS制御点を1箇所に集約
- エラーの責務境界が明確

---

## 9. 段階的移行プラン

Phase 1 (最短):
- Gatewayを追加
- open/register/submit を中継
- フロントの呼び先だけ切替

Phase 2:
- surveyToken導入
- sid直渡しを廃止

Phase 3:
- GAS公開を閉じる
- Execution APIまたは内部認証へ移行

---

## 10. 実装タスク (このリポジトリ側)

1. common/app-config.js に安全確認用の gatewayUrl を追加
2. safetycheck/index.html の通信を JSONP から fetch(POST) に変更
3. debug表示を gateway応答ベースに変更
4. GAS側は内部APIとして open/register/submit のみ公開

---

## 11. 受け入れ基準

- LINEアプリ内で 100連続アクセスして初期化失敗 0
- sid欠落エラー 0
- 同一requestId再送で重複登録なし
- 失敗時に requestId で追跡可能

---

## 12. 補足

現行の直接GAS方式は、機能追加で直るというより構造的に不安定。
今回のエラー頻発は設定ミスだけでなく、方式自体の限界に起因している可能性が高い。
