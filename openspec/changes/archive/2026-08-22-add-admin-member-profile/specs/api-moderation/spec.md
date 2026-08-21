## ADDED Requirements

### Requirement: 查詢成員的審閱概覽

`GET /api/admin/moderation/members/:memberId` SHALL 回傳審閱用的成員概覽，
需 `BACKEND:MODERATION:VIEW` 權限。

回應 MUST 只包含審閱需要的欄位：`email`、`status`（啟用狀態）、`joinedAt`、
`isOnline`、`reportedCount`（被檢舉次數）、`submittedReportCount`（提出檢舉次數）、
`roomCount`。

回應 MUST NOT 包含角色、權限、最後登入 IP，或任何密碼相關欄位。
那些回答的是「他能做什麼」——屬於 `BACKEND:ACCOUNT:VIEW` 圈起來的問題。
「反正都查回來了順手全回」是最容易發生的洩漏，而它在 code review 時
看起來只是「多回幾個欄位」。

`isOnline` 是**查詢當下的快照**，MUST NOT 要求即時性。

兩個計數 MUST 以 `count` 查詢取得，MUST NOT 取回清單再計算長度——
被檢舉 500 次的帳號會為了一個數字把 500 筆資料撈進記憶體。

本端點 MUST NOT 寫入稽核：回應不含任何訊息內容，
記了會讓稽核量與「點了幾下」對齊而非與「看到了什麼」對齊。

**授權範圍是明示的**：具備 `BACKEND:MODERATION:VIEW` 者可查詢**任何**成員的概覽，
不要求該成員與任何檢舉相關。要求「必須先有檢舉」會讓「查一個剛被停權的人」
這種正當操作失敗，而它擋不住真正想濫用的人——他可以先從任何一筆檢舉取得 id。

**Request**（path）：`memberId`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "memberId": "770e8400-e29b-41d4-a716-446655440002",
    "email": "bob@example.com",
    "status": true,
    "joinedAt": "2026-01-15T02:30:00.000Z",
    "isOnline": true,
    "reportedCount": 3,
    "submittedReportCount": 1,
    "roomCount": 5
  },
  "timestamp": "2026-08-21T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:VIEW` 權限
- `404`、`code: "MEMBER_NOT_FOUND"`：成員不存在或已被刪除

#### Scenario: 查詢一個活躍成員

- **WHEN** 有權限的管理員查詢某成員
- **THEN** 回傳七個欄位，`isOnline` 反映查詢當下 Redis 中的連線狀態

#### Scenario: 回應不含帳號管理的資料

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應 MUST NOT 出現角色、權限、最後登入 IP 或密碼相關欄位

#### Scenario: 成員不存在

- **WHEN** `memberId` 查不到或該帳號已被軟刪除
- **THEN** 回 `404`

#### Scenario: 沒有任何檢舉紀錄的成員

- **WHEN** 該成員從未被檢舉、也未提出過檢舉
- **THEN** 兩個計數皆為 `0`，不視為錯誤

#### Scenario: 查詢概覽不寫稽核

- **WHEN** 呼叫本端點
- **THEN** MUST NOT 產生任何 `chat_audit_logs` 紀錄

#### Scenario: 缺少權限

- **WHEN** 呼叫者沒有 `BACKEND:MODERATION:VIEW`
- **THEN** 回 `403`

### Requirement: 查詢成員所在的聊天室

`GET /api/admin/moderation/members/:memberId/rooms` SHALL 回傳該成員所在的聊天室，
需 `BACKEND:MODERATION:VIEW` 權限。

查詢 MUST 複用前台「我的房間」的同一支 port 方法。同一個查詢寫兩份，
日後改了一份忘了另一份就會產生兩種「房間清單」。

**`memberId` MUST 來自 path 參數**，MUST NOT 是 body 或 query 的可選欄位：
兩條路徑的授權來源不同（前台是「你只能查自己的」，這裡是「有權限就能查任何人的」），
可選欄位會讓前台那條路徑有機會傳入別人的 id。

`name` 為 `null` 代表私聊——顯示名稱由對方決定，不落庫。
`createdAt` 是**房間的建立時間**，不是該成員的加入時間：共用的回應形狀沒有後者，
而為了這一個欄位改它，代價會落到前台身上。

**Request**（path + query）：`memberId`；`page`、`limit`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440003",
        "roomType": "GROUP",
        "name": "午餐團",
        "memberCount": 5,
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

#### Scenario: 查某成員的聊天室

- **WHEN** 有權限的管理員查詢
- **THEN** 回傳該成員所在的房間，含成員數

#### Scenario: 私聊沒有名稱

- **WHEN** 清單中含私聊房間
- **THEN** 該筆的 `name` 為 `null`，由前端顯示為「私聊」

#### Scenario: 不在任何房間

- **WHEN** 該成員不在任何聊天室
- **THEN** 回傳空列表，不視為錯誤

### Requirement: 查詢與成員相關的檢舉

`GET /api/admin/moderation/members/:memberId/reports` SHALL 回傳與該成員相關的檢舉，
需 `BACKEND:MODERATION:VIEW` 權限。

`role` query 決定方向：`TARGET`（該成員被檢舉，預設）或 `REPORTER`（該成員提出的）。
兩個方向 MUST 分開查詢而非合併回傳——「他被檢舉」與「他檢舉別人」是兩件不同的事，
混在一起會讓計數與判讀都失去意義。

回應 MUST NOT 包含 `contentSnapshot`，理由與檢舉佇列相同。
每一列 MUST 包含對造的 email（`role=TARGET` 時是檢舉人，`role=REPORTER` 時是被檢舉人），
可為 `null`——規則與檢舉佇列一致。

**Request**（path + query）：`memberId`；`role`（可選，預設 `TARGET`）、`page`、`limit`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "reportId": "550e8400-e29b-41d4-a716-446655440000",
        "counterpartId": "660e8400-e29b-41d4-a716-446655440001",
        "counterpartEmail": "alice@example.com",
        "roomId": "880e8400-e29b-41d4-a716-446655440003",
        "reason": "HARASSMENT",
        "status": "PENDING",
        "createdAt": "2026-08-21T06:00:00.000Z"
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
- `400`、`code: "VALIDATION_ERROR"`：`role` 不是 `TARGET` 或 `REPORTER`

#### Scenario: 查該成員被檢舉的紀錄

- **WHEN** 未指定 `role` 或指定 `TARGET`
- **THEN** 只回傳 `targetMemberId` 為該成員的檢舉，`counterpartEmail` 是檢舉人

#### Scenario: 查該成員提出的檢舉

- **WHEN** 指定 `role=REPORTER`
- **THEN** 只回傳 `reporterId` 為該成員的檢舉，`counterpartEmail` 是被檢舉人

#### Scenario: 對造帳號已刪除

- **WHEN** 對造的帳號已不存在
- **THEN** `counterpartEmail` 為 `null`，該列其餘欄位照常回傳

#### Scenario: 列表不含內容快照

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應中 MUST NOT 出現 `contentSnapshot`

#### Scenario: 非法的 role

- **WHEN** `role` 帶入 `TARGET` / `REPORTER` 以外的值
- **THEN** 回 `400`
