## Why

nexus 的產品核心是即時聊天，但目前 repo 完全沒有即時通訊層。M1 建立這層地基——連線、認證、在線狀態、跨實例廣播——讓 M2 的聊天業務有東西可以掛上去。

**先做地基而不是直接做聊天**，是因為 eden 的失敗正是倒過來做的：先把訊息功能做出來，presence 用一個 `Map` 應付過去，等到要水平擴展時才發現整層要重寫。`OnlineTrackerService` 存在記憶體、沒裝 `@socket.io/redis-adapter`，導致**開第二個實例後跨實例的訊息直接失聯**。這不是效能問題，是功能上限。

M1 的驗收刻意訂為「起兩個 API 實例，A 實例送出的訊息 B 實例的連線收得到」——這件事 eden 跑了那麼久都證明不了。

## What Changes

- 新增 `adapter/in/ws/`：Socket.IO gateway（`/chat` namespace）、WS 認證、Zod payload 驗證、統一例外過濾
- 新增 `PresencePort` 與 Redis 實作：`memberId → 連線集合` 的在線狀態，含心跳續期與殭屍清理
- 新增 `EventPublisherPort`：跨實例廣播的抽象；實作掛 `@socket.io/redis-adapter`
- **重構既有認證**：把 `JwtAuthGuard` 內的「token → MemberContext」解析抽成共用的 application service，HTTP 與 WS 兩條路徑呼叫同一份（理由見 design.md D2）
- 新增 CLI 測試客戶端 `scripts/ws-client.ts`：可模擬多人連線、斷線、重連，用於手動驗證與整合測試
- **新增三條架構守則**：現有守則對 WS 層有系統性的涵蓋缺口（見 design.md D4）
- 依賴新增：`@nestjs/websockets`、`@nestjs/platform-socket.io`、`socket.io`、`@socket.io/redis-adapter`、`socket.io-client`（dev）

## Capabilities

### New Capabilities

- `platform-websocket-transport`：WebSocket 連線層的工程契約——認證時機與失敗行為、在線狀態的一致性保證、跨實例廣播的送達保證、連線生命週期。**不含任何聊天業務事件**（那是 M2）

### Modified Capabilities

- `platform-engineering-guardrails`：新增三條守則，補上現有規則對 WS 層的涵蓋缺口——分層規則只認 `*Controller.ts`、DTO 規則與授權涵蓋率規則只掃 `adapter/in/web`

## Impact

- **新增依賴**：五個套件，需重跑 `pnpm install`
- **改動既有程式碼**：`JwtAuthGuard` 改為呼叫抽出的共用 service（行為不變，由既有的 guard 單元測試與 e2e 保證）
- **新增 env**：WS 相關設定（心跳間隔、離線廣播延遲、連線數上限）須加進 `envSchema` 與 `.env.example`
- **CI**：整合測試要同時起兩個 API 實例，`e2e` job 的執行時間會增加
- **需使用者手動處理**：`apps/api/.env` 補上新增的 WS 設定（AI 無權限存取該檔）
- 無資料庫 schema 變動——M1 不落地任何訊息，presence 只在 Redis
