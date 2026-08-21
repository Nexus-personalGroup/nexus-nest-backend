## MODIFIED Requirements

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
