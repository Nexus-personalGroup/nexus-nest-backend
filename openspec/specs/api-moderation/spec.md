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
        "targetMemberId": "770e8400-e29b-41d4-a716-446655440002",
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

**Request**（path）：`reportId`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "reportId": "550e8400-e29b-41d4-a716-446655440000",
    "reporterId": "660e8400-e29b-41d4-a716-446655440001",
    "targetMemberId": "770e8400-e29b-41d4-a716-446655440002",
    "targetMessageId": "990e8400-e29b-41d4-a716-446655440004",
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

