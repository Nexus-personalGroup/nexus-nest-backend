## Why

`add-admin-moderation` 讓管理員看得到檢舉，但**他實際上什麼都做不了**——
只能把檢舉標記為已處理，而那則違規訊息還在房間裡。

這是目前審閱流程唯一缺的一環：看得到、判得了，但**動不了**。

當時刻意不做，理由寫在該 change 的 design.md D1：移除訊息不是「多一個 `deletedAt`」，
它需要新欄位區分「使用者撤回」與「管理員移除」（兩者對客戶端的語意不同）、
需要推播同步、需要自己的授權與稽核。那些現在一次補齊。

## What Changes

- `ChatMessageRecord` 新增 `removedAt` / `removedBy`——**與 `retractedAt` 分開**，
  理由見 design.md D1
- 新增後台端點：移除訊息、還原訊息（誤判的回頭路）
- 兩者都需要 `BACKEND:MODERATION:EDIT` 權限
- 新增 `server:messageRemoved` / `server:messageRestored` 推播讓畫面同步
- 稽核動作新增 `MESSAGE_REMOVED` / `MESSAGE_RESTORED`——**還原也留稽核**，
  反覆移除再還原本身就是可疑行為
- 移除的訊息在歷史與補齊中**仍然出現**（`seq` 不可有洞），但不含內容

## Capabilities

### New Capabilities

- `ws-chat-moderation`：移除與還原的即時推播契約

### Modified Capabilities

- `api-moderation`：新增移除與還原端點
- `api-front-chat-message`：歷史查詢的回應加上移除狀態
- `ws-chat-message`：斷線補齊的回應加上移除狀態
- `platform-observability`：稽核動作新增移除與還原

## Impact

- **資料庫 migration**：`chat_messages` 加兩個可空欄位，既有列為 null
- **回應格式變更**：訊息物件新增 `removedAt`。**對既有客戶端是相容性變更**——
  前台是獨立 repo，需同步調整
- 不改動使用者撤回的任何行為
- 無新環境變數
