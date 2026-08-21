## MODIFIED Requirements

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
