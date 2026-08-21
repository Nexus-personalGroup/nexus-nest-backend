# api-front-chat-message Specification

## Purpose
聊天訊息的 REST 契約：歷史訊息查詢與已讀位置更新。

送訊息**不在這裡**——它走 WebSocket（見 `ws-chat-message`）。同一件事只有一個入口，
兩條路徑會讓去重與限流各接一次，而不一致的症狀是「用某個路徑送的訊息不受限流」。

兩項貫穿全篇的規則：

- **分頁以 `seq` 為游標，不用頁碼**。訊息持續新增，頁碼分頁會讓後續頁次整體位移，
  造成同一則訊息重複出現或被跳過。
- **已讀只增不減**。往回捲不代表未讀，因此比目前小的請求是無操作而非錯誤；
  大於房間最新 `seq` 時會被夾住，否則那些訊息之後真的送出時會一出生就是已讀。

非成員一律回 `404` 而非 `403`——回 403 等於告訴對方「這個房間存在」。
## Requirements
### Requirement: 查詢房間的歷史訊息

`GET /api/front/chat-rooms/:roomId/messages` SHALL 只在呼叫者為該房間成員時回傳訊息，非成員 MUST 回 `404`。

分頁以 `seq` 為游標而非頁碼：訊息會持續新增，用頁碼分頁時新訊息會讓後續頁次整體位移，
造成同一則訊息重複出現或被跳過。游標分頁不受寫入影響。

預設由新到舊回傳（聊天介面從最新往回捲）。

**已撤回或已被管理員移除的訊息 MUST 仍出現在結果中**（`seq` 不可有洞），
但 `content` MUST 為空字串。

兩種狀態用**不同的欄位**表達：`retractedAt`（使用者自己收回）與
`removedAt`（因違反規範被平台移除）。兩者對使用者的語意不同，
共用一個欄位會讓發送者以為自己撤回了。兩個標記可以同時存在，
呈現上以移除優先——它是更強的宣告。

**Request**（path + query）：`roomId`；`beforeSeq`（可選，回傳 seq 小於此值的訊息）、`limit`（預設 30，上限 100）

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        "senderId": "660e8400-e29b-41d4-a716-446655440001",
        "content": "",
        "seq": 42,
        "retractedAt": "2026-08-21T06:00:00.000Z",
        "removedAt": null,
        "createdAt": "2026-08-20T06:00:00.000Z"
      }
    ],
    "hasMore": true
  },
  "timestamp": "2026-08-21T06:00:00.000Z"
}
```

未撤回的訊息 `retractedAt` 為 `null`；未被移除的 `removedAt` 為 `null`。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，**或呼叫者不是成員**

#### Scenario: 成員查詢歷史

- **WHEN** 房間成員查詢，不帶 `beforeSeq`
- **THEN** 回傳最新的 `limit` 則，由新到舊

#### Scenario: 往回翻頁

- **WHEN** 帶上一頁最舊那則的 `seq` 作為 `beforeSeq`
- **THEN** 回傳更舊的一批，MUST NOT 與上一批重疊

#### Scenario: 非成員查詢

- **WHEN** 呼叫者不是該房間成員
- **THEN** 回 `404`——不得以 `403` 洩漏房間的存在

#### Scenario: 結果含已撤回的訊息

- **WHEN** 查詢區間內有被撤回的訊息
- **THEN** 該則仍在結果中且 `seq` 連續，`content` 為空字串、`retractedAt` 有值

#### Scenario: 結果含已被移除的訊息

- **WHEN** 查詢區間內有被管理員移除的訊息
- **THEN** 該則仍在結果中且 `seq` 連續，`content` 為空字串、`removedAt` 有值

### Requirement: 更新已讀位置

`PATCH /api/front/chat-rooms/:roomId/read` SHALL 把呼叫者在該房間的已讀位置前進到指定的 `seq`，且 MUST NOT 倒退。

已讀是單調前進的。客戶端往回捲不代表未讀，因此小於目前值的請求視為無操作而非錯誤——
回錯誤會逼客戶端自己記住目前值並比較，那份狀態很容易與伺服器不一致。

走 REST 而非 WS：已讀更新可以批次、可以延遲，不需要即時往返，
而且它常在客戶端要離開畫面時送出——HTTP 的送出比 WS 更容易在那個時機完成。

**Request**（path + body）：`roomId`

```json
{ "lastReadSeq": 42 }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，或呼叫者不是成員
- `400`、`code: "BAD_REQUEST"`：`lastReadSeq` 非正整數

#### Scenario: 已讀前進

- **WHEN** 成員把已讀位置更新到比目前大的 `seq`
- **THEN** 回 `204`，房間其他成員收到 `server:roomRead`

#### Scenario: 送出比目前小的值

- **WHEN** `lastReadSeq` 小於或等於目前已讀位置
- **THEN** 回 `204` 但不改變任何資料，也 MUST NOT 推送通知

#### Scenario: 超過房間目前的最新 seq

- **WHEN** `lastReadSeq` 大於房間的 `lastSeq`
- **THEN** 以房間的 `lastSeq` 為準——客戶端不該能把已讀設到尚不存在的訊息

### Requirement: 撤回訊息

`DELETE /api/front/chat-rooms/:roomId/messages/:messageId` SHALL 由**發送者本人**在時限內撤回自己的訊息。

撤回採**軟刪除**：該列與其 `seq` MUST 保留。刪除該列會讓 `seq` 出現洞，
而補齊的客戶端無法區分「這個號碼被撤回了」與「我漏收了」。

訊息內容 MUST 保留於資料庫但 MUST NOT 由任何前台路徑回傳。
保留是為了檢舉調查——騷擾者送完立即撤回是最典型的行為。

**冪等**：重複撤回同一則回 `204`，不視為錯誤。撤回是收斂到某個狀態，
回 `409` 只會逼客戶端處理一個沒有意義的分支。

**Request**（path）：`roomId`、`messageId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，或呼叫者不是成員
- `404`、`code: "CHAT_MESSAGE_NOT_FOUND"`：訊息不存在、不屬於該房間，**或不是呼叫者發送的**
- `403`、`code: "CHAT_MESSAGE_RETRACT_EXPIRED"`：超過撤回時限

#### Scenario: 發送者在時限內撤回

- **WHEN** 發送者對自己剛送出的訊息發出撤回
- **THEN** 回 `204`，該則標記為已撤回，房間成員收到 `server:messageRetracted`

#### Scenario: 撤回他人的訊息

- **WHEN** 呼叫者不是該訊息的發送者
- **THEN** 回 `404`、`CHAT_MESSAGE_NOT_FOUND`——與「訊息不存在」同一個回應，
  否則可用它探測某則訊息是否存在

#### Scenario: 超過時限

- **WHEN** 訊息送出時間距今超過設定的時限
- **THEN** 回 `403`、`CHAT_MESSAGE_RETRACT_EXPIRED`。
  這裡 MUST NOT 與「不是你的訊息」共用錯誤碼——兩者都是發送者自己的訊息，
  沒有洩漏疑慮，而分開才給得出可行動的提示

#### Scenario: 重複撤回

- **WHEN** 對已撤回的訊息再次發出撤回
- **THEN** 回 `204`，不重複推播

