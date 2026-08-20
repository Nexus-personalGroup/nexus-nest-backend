# api-front-chat-room Specification

## Purpose
前台聊天室的 REST 契約：建立 1:1 私聊與群組、查詢自己的房間列表、離開房間。

兩項貫穿全篇的規則：

- **1:1 私聊的唯一性由資料庫的唯一約束提供**，不以「先查有沒有」實作——
  後者在兩人同時開啟對話時會建出兩個房間，症狀是訊息分裂而難以察覺。
- **「房間不存在」與「你不是成員」一律回同一個 404**。分開回報等於提供
  探測任意房間是否存在的工具；用 403 也一樣，回 403 本身就是在說「它存在」。

所有端點的資源範圍都由呼叫者的身分決定，沒有任何「指定他人」的入口。
WebSocket 端的事件契約見 `ws-chat-room`。

## Requirements
### Requirement: 建立或取得私聊房間

`POST /api/front/chat-rooms/direct` SHALL 為兩名成員建立一對一的私聊房間。
**同一組成員 MUST 只存在一個私聊房間**——
重複呼叫回傳既有房間而非建立新的，且該保證 MUST 由資料庫的唯一性約束提供，
MUST NOT 僅以「先查有沒有」實作（兩邊同時開啟對話會建出兩個房間，
症狀是訊息分裂在兩個房間，難以察覺）。

呼叫者自動成為成員之一，MUST NOT 允許代替他人建立私聊。

**Request**（body）：

```json
{ "targetMemberId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "…",
    "roomType": "DIRECT",
    "name": null,
    "memberCount": 2,
    "createdAt": "2026-08-20T06:00:00.000Z"
  },
  "timestamp": "2026-08-20T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "MEMBER_NOT_FOUND"`：`targetMemberId` 不存在或已停用
- `400`、`code: "CHAT_ROOM_SELF_DIRECT"`：`targetMemberId` 等於自己

#### Scenario: 首次建立私聊

- **WHEN** A 對 B 建立私聊，兩人之間尚無房間
- **THEN** 回 `200` 與新建房間，兩人皆為成員

#### Scenario: 重複建立同一組私聊

- **WHEN** A 對 B 建立私聊，且該房間已存在（無論當初由誰發起）
- **THEN** 回 `200` 與**既有**房間，MUST NOT 建立第二個

#### Scenario: 對自己建立私聊

- **WHEN** `targetMemberId` 等於呼叫者自己
- **THEN** 回 `400`、`code: "CHAT_ROOM_SELF_DIRECT"`

### Requirement: 建立群組房間

`POST /api/front/chat-rooms/group` SHALL 建立群組房間，呼叫者自動成為成員。
指定的成員 ID 中若有不存在或已停用者，
整個請求 MUST 失敗而非略過——部分成功會讓呼叫端以為所有人都加入了。

**Request**（body）：

```json
{ "name": "專案討論", "memberIds": ["…", "…"] }
```

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": {
    "id": "…",
    "roomType": "GROUP",
    "name": "專案討論",
    "memberCount": 3,
    "createdAt": "2026-08-20T06:00:00.000Z"
  },
  "timestamp": "2026-08-20T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "MEMBER_NOT_FOUND"`：`memberIds` 中有不存在或已停用的成員

#### Scenario: 建立群組

- **WHEN** 提供合法的名稱與成員清單
- **THEN** 回 `201`，呼叫者與清單中所有人皆為成員

#### Scenario: 成員清單含不存在的 ID

- **WHEN** `memberIds` 中任一個不存在
- **THEN** 回 `404`，且 MUST NOT 建立房間（不可部分成功）

### Requirement: 查詢自己的房間列表

`GET /api/front/chat-rooms` SHALL 只回傳呼叫者為成員的房間。
MUST NOT 提供查詢他人房間的方式。

**Request**（query）：`page`（預設 1）、`limit`（預設見 `DEFAULT_PAGE_LIMIT`）

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "…",
        "roomType": "GROUP",
        "name": "專案討論",
        "memberCount": 3,
        "createdAt": "2026-08-20T06:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 15, "total": 2, "totalPages": 1 }
  },
  "timestamp": "2026-08-20T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token

#### Scenario: 只看得到自己的房間

- **WHEN** 呼叫者是房間 X 的成員、不是房間 Y 的成員
- **THEN** 列表含 X 不含 Y

### Requirement: 離開房間

`DELETE /api/front/chat-rooms/:roomId/members/me` SHALL 移除呼叫者在該房間的成員關係。
**不採軟刪除**——重新加入即建立新的成員關係，
不需要還原舊的；歷史由稽核紀錄負責。

非成員呼叫時 MUST 回 `404` 而非 `403`：回 `403` 等於告訴對方「這個房間存在」。

**Request**（path）：`roomId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "CHAT_ROOM_NOT_FOUND"`：房間不存在，**或呼叫者不是成員**

#### Scenario: 成員離開房間

- **WHEN** 成員呼叫離開
- **THEN** 回 `204`，其成員關係被移除

#### Scenario: 非成員嘗試離開

- **WHEN** 呼叫者不是該房間成員
- **THEN** 回 `404`——不得以 `403` 洩漏房間的存在

