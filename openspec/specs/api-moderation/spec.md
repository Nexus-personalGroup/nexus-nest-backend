# api-moderation Specification

## Purpose
後台審閱的 REST 契約：檢舉佇列、單筆詳情、狀態流轉、成員行為時間軸。

這是檢舉與行為稽核的**讀取端**——在此之前，兩者的資料都只躺在資料庫裡沒有人看得到。

三個貫穿全篇的決定：

- **只做狀態流轉**（`PENDING → REVIEWED / DISMISSED`），不移除訊息也不停用帳號。
  那些是獨立的行為，各自需要自己的授權、稽核，以及對使用者的語意
  （「因違規被移除」與「已收回」對客戶端是不同的東西）。
  **先讓管理員看得到，再決定他能做什麼。**
- **查看詳情會留稽核，瀏覽列表不會**。詳情是唯一能看到被撤回訊息內容的路徑，
  而列表不含內容快照。這個切分讓稽核量與「實際看到了敏感內容的次數」對齊，
  而不是與「點了幾下」對齊。**權力要留下痕跡，否則它就只是一個沒有人在看的開關。**
- **VIEW 與 EDIT 權限分開**。查看接觸敏感內容、判定改變狀態，
  「能看的人」與「能判的人」在真實團隊裡經常不是同一群。

行為時間軸以**成員**為主體，沒有泛用的「查全部稽核」——調查的問題永遠是
「這個人做了什麼」，泛用查詢會誘使人做無調查價值的全表瀏覽。
## Requirements
### Requirement: 查詢檢舉佇列

`GET /api/admin/moderation/reports` SHALL 回傳檢舉列表，需 `BACKEND:MODERATION:VIEW` 權限。

回應 MUST NOT 包含 `contentSnapshot`。列表不含內容有兩個理由：
它讓稽核量與「實際看到敏感內容的次數」對齊（見詳情端點），
也讓管理員瀏覽佇列時不會無意間看到一整頁的敏感內容。

回應 MUST 包含 `reporterEmail` 與 `targetMemberEmail`，供介面辨識當事人。
兩者 MUST 可為 `null`——`chat_reports` 刻意沒有外鍵，帳號被刪除後檢舉仍須可審閱，
此時查不到 email。**回 `null` 而非省略欄位或空字串**：省略讓呼叫端分不出
「後端沒給」與「真的沒有」，空字串會被誤render成空白格。

email 的補齊 MUST 以**單次批次查詢**完成，MUST NOT 逐列查詢。

回應 MUST NOT 包含 email 以外的成員資料（角色、狀態、最後登入時間等）——
本端點的授權是 `BACKEND:MODERATION:VIEW`，帶出帳號管理的資料等於繞過
`BACKEND:ACCOUNT:VIEW` 的邊界。

**Request**（query）：`status`（可選，預設 `PENDING`）、`page`、`limit`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "reportId": "550e8400-e29b-41d4-a716-446655440000",
        "reporterId": "660e8400-e29b-41d4-a716-446655440001",
        "reporterEmail": "alice@example.com",
        "targetMemberId": "770e8400-e29b-41d4-a716-446655440002",
        "targetMemberEmail": "bob@example.com",
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

#### Scenario: 預設只看待處理

- **WHEN** 未指定 `status`
- **THEN** 只回傳 `PENDING` 的檢舉

#### Scenario: 列表不含內容快照

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應中 MUST NOT 出現 `contentSnapshot`

#### Scenario: 帶出當事人的 email

- **WHEN** 檢舉人與被檢舉人的帳號都存在
- **THEN** 每一列回傳 `reporterEmail` 與 `targetMemberEmail`

#### Scenario: 當事人的帳號已被刪除

- **WHEN** 某筆檢舉的被檢舉人帳號已不存在
- **THEN** 該列的 `targetMemberEmail` 為 `null`，其餘欄位照常回傳——
  帳號消失不該讓檢舉無法審閱

#### Scenario: 補 email 不得逐列查詢

- **WHEN** 一頁回傳 15 筆檢舉
- **THEN** 補 email 的查詢 MUST 只有一次，MUST NOT 隨筆數增長

#### Scenario: 缺少權限

- **WHEN** 呼叫者沒有 `BACKEND:MODERATION:VIEW`
- **THEN** 回 `403`

### Requirement: 查詢檢舉詳情

`GET /api/admin/moderation/reports/:reportId` SHALL 回傳單筆檢舉的完整內容（含 `contentSnapshot`），
需 `BACKEND:MODERATION:VIEW` 權限，且**每次呼叫 MUST 寫入一筆稽核紀錄**。

這是本專案唯一能看到**被撤回訊息內容**的路徑。撤回的內容保留在資料庫供調查，
而這條路徑存在的理由正是調查。

**查看必須留下痕跡。** 如果查看不留痕跡，這條路徑與「任何人都看得到」在事後沒有
實質區別——差別只在誰有權限，而權限可能被誤配、被濫用、或在事後被質疑。
權力要留下痕跡，否則它就只是一個沒有人在看的開關。

稽核 MUST 在回應送出前寫入嘗試，但其失敗 MUST NOT 讓查詢失敗
（沿用 `platform-observability` 的 best-effort 規則）。

回應 MUST 包含 `reporterEmail` 與 `targetMemberEmail`，規則與佇列相同（可為 `null`）。

回應 MUST 包含 `targetMessageRemovedAt`：被檢舉訊息目前的移除時間，未被移除為 `null`。
**回時間戳而非布林**——布林會讓「何時被移除」永遠拿不到，而那是審閱紀錄的一部分；
時間戳推得出布林，反之不行。該訊息已不存在（例如已被清理）時同樣回 `null`。

回應 MUST NOT 包含 `removedBy`：那是稽核紀錄回答的問題，時間軸端點已經在回答它，
在詳情裡再放一份會產生兩個可能不一致的來源。

**Request**（path）：`reportId`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "reportId": "550e8400-e29b-41d4-a716-446655440000",
    "reporterId": "660e8400-e29b-41d4-a716-446655440001",
    "reporterEmail": "alice@example.com",
    "targetMemberId": "770e8400-e29b-41d4-a716-446655440002",
    "targetMemberEmail": "bob@example.com",
    "targetMessageId": "990e8400-e29b-41d4-a716-446655440004",
    "targetMessageRemovedAt": null,
    "roomId": "880e8400-e29b-41d4-a716-446655440003",
    "reason": "HARASSMENT",
    "description": "持續辱罵",
    "contentSnapshot": "被檢舉時的訊息內容",
    "status": "PENDING",
    "reviewedAt": null,
    "reviewedBy": null,
    "reviewNote": null,
    "createdAt": "2026-08-21T06:00:00.000Z"
  },
  "timestamp": "2026-08-21T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:VIEW` 權限
- `404`、`code: "CHAT_REPORT_NOT_FOUND"`：檢舉不存在

#### Scenario: 查看詳情

- **WHEN** 有權限的管理員查詢單筆檢舉
- **THEN** 回傳含 `contentSnapshot` 的完整內容，並寫入一筆 `REPORT_VIEWED` 稽核

#### Scenario: 被檢舉的訊息已撤回

- **WHEN** 快照對應的訊息已被撤回
- **THEN** 仍回傳快照內容——撤回不該讓調查失去依據

#### Scenario: 被檢舉的訊息已被管理員移除

- **WHEN** 該訊息已被移除
- **THEN** `targetMessageRemovedAt` 回傳移除的時間戳，介面據此顯示「還原」而非「移除」

#### Scenario: 被檢舉的訊息未被移除

- **WHEN** 該訊息仍在
- **THEN** `targetMessageRemovedAt` 為 `null`

#### Scenario: 被檢舉的訊息已不存在

- **WHEN** 該訊息在資料庫中查不到
- **THEN** `targetMessageRemovedAt` 為 `null`，其餘欄位照常回傳——
  檢舉的快照本來就不依賴訊息是否還在

#### Scenario: 稽核寫入失敗

- **WHEN** 稽核寫入失敗
- **THEN** 查詢照常回傳，錯誤以 error 等級記錄

### Requirement: 檢舉的狀態流轉

`PATCH /api/admin/moderation/reports/:reportId` SHALL 把檢舉標記為已處理或駁回，
需 `BACKEND:MODERATION:EDIT` 權限。

本需求**只做狀態流轉**，MUST NOT 移除訊息或停用帳號。那些是獨立的行為，
各自需要自己的授權、稽核，以及對使用者的語意
（「因違規被移除」與「已收回」對客戶端是不同的東西）。

狀態 MUST NOT 從終態回到 `PENDING`。`REVIEWED` 與 `DISMISSED` 之間允許互轉——
那是終態間的更正，不是重新開啟。

**Request**（body）：

```json
{ "status": "REVIEWED", "reviewNote": "已私下警告" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "CHAT_REPORT_NOT_FOUND"`：檢舉不存在
- `400`、`code: "CHAT_REPORT_INVALID_TRANSITION"`：目標狀態為 `PENDING`

#### Scenario: 標記為已處理

- **WHEN** 有權限的管理員把 `PENDING` 改為 `REVIEWED`
- **THEN** 回 `204`，記錄 `reviewedAt` / `reviewedBy` / `reviewNote`

#### Scenario: 終態間更正

- **WHEN** 從 `REVIEWED` 改為 `DISMISSED`
- **THEN** 允許——那是更正，不是重新開啟

#### Scenario: 回到待處理

- **WHEN** 目標狀態為 `PENDING`
- **THEN** 回 `400`、`CHAT_REPORT_INVALID_TRANSITION`

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者有 `BACKEND:MODERATION:VIEW` 但沒有 `EDIT`
- **THEN** 回 `403`——能看的人與能判的人在真實團隊裡經常不是同一群

### Requirement: 查詢成員的行為時間軸

`GET /api/admin/moderation/members/:memberId/timeline` SHALL 回傳該成員的稽核紀錄，
需 `BACKEND:MODERATION:VIEW` 權限。

端點以**成員**為主體，MUST NOT 提供泛用的「查全部稽核」查詢。
調查的問題永遠是「這個人做了什麼」，而 `chat_audit_logs` 的索引就是為它建的；
泛用查詢會誘使人做無調查價值的全表瀏覽。

回應 MUST NOT 包含訊息內容——稽核紀錄本來就不存內容。

**Request**（path + query）：`memberId`；`page`、`limit`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "action": "ROOM_LEFT",
        "roomId": "880e8400-e29b-41d4-a716-446655440003",
        "targetMemberId": null,
        "targetMessageId": null,
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

#### Scenario: 查詢某成員的行為

- **WHEN** 有權限的管理員查詢某成員
- **THEN** 回傳該成員的稽核紀錄，由新到舊

#### Scenario: 成員沒有任何紀錄

- **WHEN** 該成員從未產生稽核紀錄
- **THEN** 回傳空列表，不視為錯誤

### Requirement: 移除違規訊息

`DELETE /api/admin/moderation/messages/:messageId` SHALL 由管理員移除違規訊息，
需 `BACKEND:MODERATION:EDIT` 權限。

移除採**軟刪除**：該列與其 `seq` MUST 保留，內容 MUST 保留於資料庫。
移除的訊息正是最需要留下證據的那些——檢舉調查、申訴、日後的爭議都要看得到原文。

移除 MUST 使用與使用者撤回**不同的標記**（`removedAt`），MUST NOT 共用 `retractedAt`。
兩者對客戶端的語意不同（「對方自己收回」vs「被平台處理」），
共用會讓發送者以為自己撤回了，也讓後台無法統計「被移除幾則」。

**移除 MUST NOT 要求該訊息被檢舉過**：管理員可能從私訊、主動巡邏等管道發現違規內容。
移除的授權來自 RBAC，不來自檢舉的存在。

**冪等**：重複移除同一則回 `204`，不重複推播。

**Request**（path）：`messageId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "CHAT_MESSAGE_NOT_FOUND"`：訊息不存在

#### Scenario: 移除訊息

- **WHEN** 有權限的管理員移除某則訊息
- **THEN** 回 `204`，該則標記為已移除，房間成員收到 `server:messageRemoved`

#### Scenario: 已被使用者撤回的訊息

- **WHEN** 該則已被發送者撤回
- **THEN** 仍可移除；兩個標記同時存在，呈現上以移除優先

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者有 `BACKEND:MODERATION:VIEW` 但沒有 `EDIT`
- **THEN** 回 `403`

#### Scenario: 重複移除

- **WHEN** 對已移除的訊息再次執行移除
- **THEN** 回 `204`，MUST NOT 重複推播、MUST NOT 覆寫原本的移除時間

### Requirement: 還原被誤移除的訊息

`POST /api/admin/moderation/messages/:messageId/restore` SHALL 清除移除標記，
需 `BACKEND:MODERATION:EDIT` 權限。

誤判在審閱情境是真實的。沒有回頭路會讓管理員傾向不敢處理——
**一個不敢用的工具等於沒有工具**。

還原 MUST NOT 影響使用者自己的撤回狀態：若該則原本已被發送者撤回，
還原後 MUST 回到「已收回」而非完全正常。

還原 MUST 留下稽核紀錄。`removedAt` 清除後，「這則曾經被移除過」就不再留在訊息列上，
而**反覆移除再還原本身就是可疑行為**——只有兩邊都記才看得出那個模式。

**Request**（path）：`messageId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "CHAT_MESSAGE_NOT_FOUND"`：訊息不存在

#### Scenario: 還原被移除的訊息

- **WHEN** 有權限的管理員還原一則被移除的訊息
- **THEN** 回 `204`，移除標記被清除，房間成員收到 `server:messageRestored`

#### Scenario: 還原曾被撤回的訊息

- **WHEN** 該則原本已被發送者撤回，之後被移除
- **THEN** 還原後 `retractedAt` 仍保留——它回到「已收回」而非完全正常

#### Scenario: 還原未被移除的訊息

- **WHEN** 該則沒有被移除過
- **THEN** 回 `204`（冪等），MUST NOT 推播

#### Scenario: 還原留下稽核

- **WHEN** 還原成功
- **THEN** 留下稽核紀錄——否則「曾被移除」這件事在還原後就沒有任何痕跡

