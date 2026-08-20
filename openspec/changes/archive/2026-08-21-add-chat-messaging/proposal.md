## Why

房間有了，但房間裡沒有東西。M1 建連線層、`add-chat-rooms` 建房間與成員資格，這個 change 補上聊天本身。

訊息這件事表面上只是「寫一列、廣播出去」，難的是三個在網路不可靠時才會顯形的問題，而它們**必須在第一版就決定**——事後補的代價遠高於一開始做對：

- **重送會變成兩則訊息**。使用者按送出、網路斷了、客戶端重試——伺服器收到兩次。沒有去重機制的話，症狀是聊天室裡偶爾出現重複訊息，而且無法從伺服器端事後修復（兩列都是合法資料，分不出哪列是重送）。
- **順序不是送達順序**。兩個實例同時寫入，`createdAt` 可能同毫秒；用時間排序會讓不同客戶端看到不同的訊息順序。這類錯誤在單機測試中永遠不會出現。
- **斷線期間的訊息會消失**。WebSocket 斷線重連是常態而非異常，重連後不補齊就是靜默丟訊息——使用者不會知道自己漏看了什麼。

前一版專案（eden）三件都沒做，最後的症狀是「偶爾重複、偶爾亂序、偶爾漏訊息」，每一個都難以重現。

## What Changes

- **資料模型**：`ChatMessageRecord`（訊息）、`ChatRoomReadRecord`（每人每房間的已讀位置）
- **送訊息走 WebSocket**（`client:sendMessage` + `server:messageAck`），不走 REST——理由見 design.md D1
- **`clientMessageId` 去重**：`(roomId, clientMessageId)` 唯一索引；重送同一個 ID 回傳原本的 ack 而非新增
- **per-room 單調遞增 `seq`**：訊息順序的唯一依據，不用時間戳
- **歷史查詢與斷線補齊**：REST 分頁查歷史；重連後帶 `lastSeq` 補齊斷線期間的訊息
- **已讀回條**：每人每房間記 `lastReadSeq`，變動時通知房間其他成員
- **新增守則**：WS handler 必須限流——訊息是第一個「使用者可以無限次觸發、且每次都寫 DB」的事件

## Capabilities

### New Capabilities

- `api-front-chat-message`：訊息歷史查詢與已讀位置更新的 REST 契約
- `ws-chat-message`：送訊息、ack、訊息廣播、斷線補齊、已讀通知的 WebSocket 事件契約

### Modified Capabilities

- `platform-engineering-guardrails`：新增「會寫入的 WS handler 必須限流」守則
- `platform-websocket-transport`：補一條 scenario——ack 必須在寫入成功後才送出，不可樂觀回覆

## Impact

- **資料庫 migration**：新增兩張表；需重跑 `db:migrate`
- **`ChatRoomRecord` 增加一個欄位**（`lastSeq`），既有列以預設值 0 回填，不影響現有資料
- **新增 REST 端點**：走既有的 `gen:module --front` 產生器
- **新增環境變數**：訊息限流的閾值與視窗（要進 `validate-env.ts` 的 `envSchema`）
- 不改動既有 WS 事件的行為；`add-chat-rooms` 的整合測試不需修改
