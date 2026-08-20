## Why

M1 建立了連線層地基，但**沒有房間的概念**——`joinGroup` handler 接受任意 `groupId` 並直接把連線加進該 socket room。

也就是說：**任何已認證的使用者可以加入任意群組並收到該群組的全部廣播**。那是 M1 的佔位實作（當時沒有房間資料可驗證），但它現在是實際的授權漏洞，而且沒有任何守則會抓到——`authorization-coverage` 檢查的是「handler 有沒有表態認證」，而它表態了。

聊天的一切都建立在「誰能看到什麼」之上。房間與成員關係必須先於訊息存在，否則訊息一寫出來就沒有可以據以授權的東西。

## What Changes

- **資料模型**：`ChatRoomRecord`（房間）、`ChatRoomMemberRecord`（成員關係），含 1:1 私聊的唯一性保證
- **房間 CRUD 走 REST**（`/api/front/chat/rooms`），不走 WebSocket——理由見 design.md D1
- **`joinGroup` 補上成員資格驗證**：加入 socket room 前必須確認 DB 中的成員關係。這是本 change 的安全性核心
- WS 事件改用房間語彙：`client:joinRoom` / `client:leaveRoom`，並新增 `server:roomMemberChanged`
- 新增守則：**WS 事件中凡是接受資源識別碼的 handler，必須經過授權判斷**——與 HTTP 端「接受任意資源識別碼的端點必須表態授權」同型，而 WS 端目前完全沒有對應規則

## Capabilities

### New Capabilities

- `api-front-chat-room`：房間的 REST 契約——建立、查詢自己的房間列表、成員管理
- `ws-chat-room`：房間相關的 WebSocket 事件契約——加入／離開 socket room、成員變動通知

### Modified Capabilities

- `platform-engineering-guardrails`：新增「WS 事件的資源存取必須經授權判斷」的守則
- `platform-websocket-transport`：M1 的「Gateway 只做轉譯」需求補上一條 scenario——加入房間必須先驗證成員資格，不可僅憑客戶端提供的識別碼

## Impact

- **資料庫 migration**：新增兩張表；需重跑 `db:migrate`
- **破壞既有的 `joinGroup` 行為**：現在會拒絕非成員。M1 的整合測試用的是任意 `groupId`，需改為先建立房間與成員關係
- **新增 REST 端點**：走既有的 `gen:module --front` 產生器，swagger 與 api-client 一併更新
- 無新環境變數
