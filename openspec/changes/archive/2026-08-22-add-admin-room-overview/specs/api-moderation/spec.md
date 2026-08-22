## ADDED Requirements

### Requirement: 查詢聊天室列表

`GET /api/admin/moderation/rooms` SHALL 回傳聊天室列表，需 `BACKEND:MODERATION:VIEW` 權限。

每一列 MUST 包含 `roomId`、`roomType`、`name`、`memberCount`、`messageCount`、`createdAt`。
`name` 為 `null` 代表私聊——顯示名稱由對方決定，不落庫。

`messageCount` MUST 取自 `chat_rooms.last_seq`，MUST NOT 以 `count(*)` 計算。
訊息列永遠不會被刪除（刪除會讓 `seq` 出現洞，補齊的客戶端無法區分
「被清掉」與「我漏收了」），因此 `last_seq` 就是歷史訊息總數，而它已經在房間那一列上。
**其語意是「歷史累計」而非「目前存在的列數」**，回應的文件必須寫明——
否則日後有人拿它跟資料庫列數對不起來會以為有 bug。

`roomType` query 可篩選 `DIRECT` 或 `GROUP`；未指定回傳全部。

回應 MUST NOT 包含任何訊息內容。

**Request**（query）：`roomType`（可選）、`page`、`limit`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "roomId": "880e8400-e29b-41d4-a716-446655440003",
        "roomType": "GROUP",
        "name": "午餐團",
        "memberCount": 5,
        "messageCount": 142,
        "createdAt": "2026-08-01T06:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 15, "total": 1, "totalPages": 1 }
  },
  "timestamp": "2026-08-21T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:VIEW` 權限
- `400`、`code: "VALIDATION_ERROR"`：`roomType` 不是 `DIRECT` 或 `GROUP`

#### Scenario: 列出全部房間

- **WHEN** 未指定 `roomType`
- **THEN** 群組與私聊都回傳，依建立時間由新到舊

#### Scenario: 只看群組

- **WHEN** 指定 `roomType=GROUP`
- **THEN** 只回傳群組房間

#### Scenario: 私聊沒有名稱

- **WHEN** 清單中含私聊
- **THEN** 該筆的 `name` 為 `null`

#### Scenario: 訊息量取自 last_seq

- **WHEN** 某房間曾發出 10 則訊息、其中 3 則已被撤回或移除
- **THEN** `messageCount` 為 `10`——它回答的是「這個房間曾經有多少訊息」

#### Scenario: 列表不含訊息內容

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應 MUST NOT 出現任何訊息內容

#### Scenario: 缺少權限

- **WHEN** 呼叫者沒有 `BACKEND:MODERATION:VIEW`
- **THEN** 回 `403`

### Requirement: 查詢單一聊天室的概覽

`GET /api/admin/moderation/rooms/:roomId` SHALL 回傳單一房間的概覽與成員清單，
需 `BACKEND:MODERATION:VIEW` 權限。

回應 MUST 包含列表的所有欄位，外加 `members`：每位成員的 `memberId`、
`email`（帳號已刪除時為 `null`）、`joinedAt`。

email 的補齊 MUST 以**單次批次查詢**完成，MUST NOT 逐位查詢。

成員清單 MUST NOT 分頁：房間成員數受業務常識約束，而分頁一個 20 人的清單
只會多一組狀態要管。

回應 MUST NOT 包含任何訊息內容，也 MUST NOT 提供任何取得訊息的連結或識別碼——
房間詳情**不是**內容存取路徑。

**Request**（path）：`roomId`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "roomId": "880e8400-e29b-41d4-a716-446655440003",
    "roomType": "GROUP",
    "name": "午餐團",
    "memberCount": 2,
    "messageCount": 142,
    "createdAt": "2026-08-01T06:00:00.000Z",
    "members": [
      {
        "memberId": "770e8400-e29b-41d4-a716-446655440002",
        "email": "bob@example.com",
        "joinedAt": "2026-08-01T06:00:00.000Z"
      },
      {
        "memberId": "660e8400-e29b-41d4-a716-446655440001",
        "email": null,
        "joinedAt": "2026-08-02T06:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-08-21T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:VIEW` 權限
- `404`、`code: "CHAT_ROOM_NOT_FOUND"`：房間不存在

#### Scenario: 查詢一個群組

- **WHEN** 有權限的管理員查詢
- **THEN** 回傳房間概覽與完整成員清單，每位成員含 email

#### Scenario: 成員的帳號已刪除

- **WHEN** 某位成員的帳號已不存在
- **THEN** 該位的 `email` 為 `null`，其餘欄位照常，該成員仍在清單中

#### Scenario: 補 email 不得逐位查詢

- **WHEN** 房間有 20 位成員
- **THEN** 補 email 的查詢 MUST 只有一次

#### Scenario: 房間不存在

- **WHEN** `roomId` 查不到
- **THEN** 回 `404`

#### Scenario: 詳情不提供訊息的存取途徑

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應 MUST NOT 含訊息內容或訊息 ID——要看內容只能經由檢舉
