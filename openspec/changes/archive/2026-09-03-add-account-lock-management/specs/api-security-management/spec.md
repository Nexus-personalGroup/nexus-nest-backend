## ADDED Requirements

### Requirement: 帳號鎖定列表查詢

`GET /api/admin/security/locks` SHALL 分頁回傳有鎖定紀錄的後台帳號
（`members.locked_at != null`），支援 email 模糊搜尋與鎖定狀態過濾，
排序依 `lockedAt` 遞減。

**到期判定 MUST 與登入路徑共用同一份實作。** `locked_at` 只是時間戳，
「還鎖著嗎」要靠 `locked_at + APPLICATION_ACCOUNT_LOCK_DURATION_MIN` 計算，
而該計算已存在於 `AccountLockPort` 的實作。列表 MUST NOT 自己再算一次——
兩份計算會漂移，症狀是「列表說鎖著、但那個人登得進去」，
看起來像資料不同步，實際是兩份規則。

**每一列 MUST 回傳判定後的狀態**，MUST NOT 只回 `lockedAt` 讓呼叫端自己心算。

`status` 預設為 `locked`：打開這一頁的人問的是「現在有誰被鎖著」。
但 `expired` 與 `all` MUST 可查——`locked_at` 要到下次登入或解鎖時才被清除，
在那之前「這個人今天被鎖過」只能從這裡看到（系統沒有鎖定歷史表）。

**Request**（query）：

- `page?: integer` — 預設 1
- `limit?: integer` — 上限 200，未指定時取 `DEFAULT_PAGE_LIMIT`
- `search?: string` — email 模糊比對（contains，不分大小寫）；trim 後為空字串視為未提供
- `status?: 'locked' | 'expired' | 'all'` — 預設 `locked`。
  以 zod `z.enum` 嚴格解析，其他值 MUST 回 400

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
        "email": "admin@test.com",
        "member": "系統管理員",
        "lockedAt": "2026-09-02T06:00:00.000Z",
        "unlocksAt": "2026-09-02T06:30:00.000Z",
        "failedLoginCount": 3,
        "status": "locked"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
    "lockEnabled": true
  },
  "timestamp": "2026-09-02T06:10:00.000Z"
}
```

`unlocksAt` MUST 一併回傳：管理員要判斷的是「還要等多久」，
只給 `lockedAt` 等於要他自己知道並套用設定值。

**回應 MUST 帶 `lockEnabled`。** `APPLICATION_ACCOUNT_LOCK_ENABLED` 預設 `false`，
而 flag 關閉時登入路徑**不會寫入 `lockedAt`**——清單於是永遠是空的。
沒有這個旗標，呼叫端分不出「沒有人被鎖」與「根本不會鎖」，
而那兩件事的意義相反。放進本回應而不是另開一支 flag 端點：
需要它的只有這一頁，而它本來就要呼叫這支。

**Failure Responses**：見「SUPERADMIN role gate」。

- `400`、`code: "VALIDATION_ERROR"`：`status` 非三個允許值之一

#### Scenario: 預設只回鎖定中的帳號

- **WHEN** 未指定 `status`
- **THEN** 只回 `status` 為 `locked` 的帳號，
  已到期但尚未被清除的 MUST NOT 出現

#### Scenario: ⭐ 查詢已到期的鎖定紀錄

- **WHEN** 指定 `status=expired`
- **THEN** 回傳 `locked_at != null` 但已超過時效的帳號，每一列的 `status` 為 `expired`

#### Scenario: ⭐ 到期判定與登入一致

- **WHEN** 某帳號的 `locked_at` 剛好超過 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`
- **THEN** 列表判定為 `expired`，且該帳號此時 MUST 能夠登入
  ——兩者 MUST NOT 出現不一致

#### Scenario: ⭐ 帳號鎖定功能停用

- **WHEN** `APPLICATION_ACCOUNT_LOCK_ENABLED` 為 `false`
- **THEN** 回應的 `lockEnabled` 為 `false`，
  且清單必然為空（系統不會產生任何鎖定紀錄）

#### Scenario: 沒有任何鎖定紀錄

- **WHEN** 系統中沒有符合條件的帳號
- **THEN** 回傳空 `list` 與 `total: 0`，MUST NOT 回錯誤

#### Scenario: 非 SUPERADMIN 存取

- **WHEN** 一般管理員呼叫本端點
- **THEN** 回 `403`，即使該帳號持有全部 `BACKEND:*` 權限碼
