# api-security-management Specification

## Purpose

定義後台「安全管理」的全部 endpoint 契約（`/api/admin/security/*`），共十一支：
IP 白名單 CRUD（5）、IP 黑名單 CRUD（5）、帳號解鎖（1）。

本 capability 的權限模型與其他後台 capability **刻意不同**——使用
`RolesGuard + @Roles('SUPERADMIN')` 的粗粒度 role gate，而非 `PermissionsGuard`
的細粒度權限碼。安全設定屬於「不該用權限碼細分」的一類：能改 IP 名單等同能繞過
所有 IP 層防護，不存在只給一半的合理情境。

前端畫面行為見 `ui-security-management`。

## Requirements

### Requirement: SUPERADMIN role gate

`/api/admin/security/*` 的全部 endpoint SHALL 由 `RolesGuard + @Roles('SUPERADMIN')`
保護，僅 `roleCode === 'SUPERADMIN'` 的使用者可存取。
沒有該角色者 MUST 回 `403`，**無論持有多少其他權限碼**。未登入或 JWT 失效 MUST 回 `401`。

**Failure Responses**（適用於本 capability 的每一支 endpoint，各需求不再重複列出）：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：已登入但 `roleCode` 非 `SUPERADMIN`

```json
{
  "success": false,
  "message": "沒有權限執行此操作",
  "code": "FORBIDDEN",
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

#### Scenario: 無 token

- **WHEN** 未帶 Authorization header 打任何 `/api/admin/security/*`
- **THEN** 回 `401`

#### Scenario: 已登入但非 SUPERADMIN

- **WHEN** 一般管理員（`roleCode` 非 `SUPERADMIN`）打任何 `/api/admin/security/*`
- **THEN** 回 `403`，即使該帳號持有全部 `BACKEND:*` 權限碼

### Requirement: IP 白名單列表查詢

`GET /api/admin/security/ip-whitelist` SHALL 分頁回傳 IP 白名單，支援 IP 模糊搜尋，
排序依 `createdAt` 遞減。

**Request**（query）：

- `page?: integer` — 預設 1
- `limit?: integer` — 上限 200，未指定時取 `DEFAULT_PAGE_LIMIT`
- `search?: string` — IP 模糊比對（contains）；trim 後為空字串視為未提供

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "b71f0e2c-9a34-4d18-8c5f-6e2a1d740b93",
        "ipAddress": "192.168.1.1",
        "description": "辦公室 IP",
        "createdBy": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
        "createdAt": "2026-08-16T06:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：見「SUPERADMIN role gate」。

#### Scenario: 預設分頁

- **WHEN** SUPERADMIN 打 `GET /api/admin/security/ip-whitelist`
- **THEN** 回 `200`，`meta.page` 為 1

#### Scenario: IP 模糊搜尋

- **WHEN** 打 `?search=192.168`
- **THEN** 回 `200`，`data.list` 僅含 `ipAddress` 含 `192.168` 的紀錄

#### Scenario: search 空字串視為未提供

- **WHEN** 打 `?search=`
- **THEN** 回 `200`，結果等同不帶 `search`

### Requirement: 新增 IP 到白名單（upsert 語意）

`POST /api/admin/security/ip-whitelist` SHALL 將 IP 加入白名單，成功回 `201` 與紀錄 ID。

本 endpoint 為 **upsert 而非純新增**：`ipAddress` 已存在時 MUST NOT 報錯，
而是更新該筆的 `description` 與 `createdBy`，並回傳**既有紀錄**的 id。
重送同一個 IP 因此是冪等的，不會產生重複列，也不會回 409。

**Request**（body，`ip` 必填）：

```json
{ "ip": "192.168.1.1", "description": "辦公室 IP" }
```

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": { "id": "b71f0e2c-9a34-4d18-8c5f-6e2a1d740b93" },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`ip` 缺漏或非合法 IPv4 / IPv6 格式
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 新增成功

- **WHEN** SUPERADMIN 送 `{ "ip": "192.168.1.1", "description": "office" }` 且該 IP 尚未存在
- **THEN** 回 `201`，`data.id` 為新建紀錄的 uuid

#### Scenario: 重複 IP 為更新而非報錯

- **WHEN** 對已存在的 `ipAddress` 再次送出，`description` 不同
- **THEN** 回 `201`，`data.id` 為**既有**紀錄的 id，該筆 `description` 被更新，且白名單總筆數不變

#### Scenario: 非法 IP 格式

- **WHEN** `ip` 為 `"not-an-ip"`
- **THEN** 回 `400`，不寫入

### Requirement: 查詢單筆 IP 白名單

`GET /api/admin/security/ip-whitelist/:id` SHALL 回傳單筆白名單紀錄，供編輯 dialog 帶初值。
`id` 由 `ParseUUIDPipe` 驗證。

**Request**（path）：`id: string (uuid)`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "b71f0e2c-9a34-4d18-8c5f-6e2a1d740b93",
    "ipAddress": "192.168.1.1",
    "description": "辦公室 IP",
    "createdBy": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
    "createdAt": "2026-08-16T06:00:00.000Z"
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`id` 非合法 uuid（`ParseUUIDPipe`）
- `404`、`code: "IP_LIST_NOT_FOUND"`：紀錄不存在
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 找到紀錄

- **WHEN** SUPERADMIN 打 `GET /api/admin/security/ip-whitelist/<uuid>` 且紀錄存在
- **THEN** 回 `200`，`data` 為單筆白名單形狀

#### Scenario: 紀錄不存在

- **WHEN** 該 uuid 不存在
- **THEN** 回 `404`、`code: "IP_LIST_NOT_FOUND"`

### Requirement: 更新 IP 白名單

`PATCH /api/admin/security/ip-whitelist/:id` SHALL 更新白名單的可變欄位（目前僅
`description`）。`ipAddress` MUST NOT 可變——要改 IP 就刪除重建，否則既有的
「這個 IP 何時被誰加入」稽核線索會被靜默改寫。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path `id: string (uuid)`；body 全部選填）：

```json
{ "description": "新辦公室 IP" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`id` 非合法 uuid
- `404`、`code: "IP_LIST_NOT_FOUND"`：紀錄不存在
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 更新成功

- **WHEN** SUPERADMIN 送 `{ "description": "新備註" }`
- **THEN** 回 `204`，該紀錄 `description` 更新

#### Scenario: 省略欄位不變更

- **WHEN** body 為 `{}`
- **THEN** 回 `204`，該紀錄所有欄位維持原值

#### Scenario: 紀錄不存在

- **WHEN** 該 uuid 不存在
- **THEN** 回 `404`、`code: "IP_LIST_NOT_FOUND"`

### Requirement: 從白名單移除 IP（硬刪除且靜默）

`DELETE /api/admin/security/ip-whitelist/:id` SHALL 移除指定紀錄。
本表**無 `deletedAt` 欄位，維持硬刪除**——IP 名單是即時生效的防護設定，
保留軟刪除資料只會讓「這個 IP 現在到底通不通」變得需要額外判斷。

紀錄不存在時 MUST NOT 報錯，仍回 `204`（與 member / role 的刪除行為一致，
確保重送刪除是冪等的）。

**Request**（path）：`id: string (uuid)`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`id` 非合法 uuid
- 其餘見「SUPERADMIN role gate」。**不會回 404。**

#### Scenario: 刪除成功

- **WHEN** SUPERADMIN 打 `DELETE /api/admin/security/ip-whitelist/<uuid>` 且紀錄存在
- **THEN** 回 `204`，該資料列自 DB 直接消失（硬刪）

#### Scenario: 紀錄不存在靜默通過

- **WHEN** 該 uuid 不存在
- **THEN** 回 `204`，MUST NOT 回 404

### Requirement: IP 黑名單列表查詢

`GET /api/admin/security/ip-blacklist` SHALL 分頁回傳 IP 黑名單，
query 參數與排序同白名單。每筆額外帶 `reason` 與 `isAutoBlock`
（`isAutoBlock: true` 表示由登入失敗次數超標等機制自動封鎖，非人工加入）。

**Request**（query）：同「IP 白名單列表查詢」。

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "c82a1f3d-0b45-4e29-9d6a-7f3b2e851c04",
        "ipAddress": "10.0.0.1",
        "reason": "異常登入嘗試",
        "isAutoBlock": false,
        "createdBy": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
        "createdAt": "2026-08-16T06:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：見「SUPERADMIN role gate」。

#### Scenario: 預設分頁

- **WHEN** SUPERADMIN 打 `GET /api/admin/security/ip-blacklist`
- **THEN** 回 `200`，`meta.page` 為 1

#### Scenario: 區分自動與人工封鎖

- **WHEN** 清單同時含自動封鎖與人工加入的紀錄
- **THEN** 各筆 `isAutoBlock` MUST 正確反映其來源

### Requirement: 新增 IP 到黑名單（upsert 語意）

`POST /api/admin/security/ip-blacklist` SHALL 將 IP 加入黑名單，成功回 `201` 與紀錄 ID。
與白名單相同為 **upsert**：`ipAddress` 已存在時更新 `reason` / `createdBy` / `isAutoBlock`
並回既有紀錄 id。

**由此路徑寫入時 `isAutoBlock` MUST 為 `false`**——人工重新加入一個原本自動封鎖的 IP，
會把它轉為人工封鎖，使其不再受自動封鎖的解除機制影響。

**Request**（body，`ip` 必填）：

```json
{ "ip": "10.0.0.1", "reason": "異常登入嘗試" }
```

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": { "id": "c82a1f3d-0b45-4e29-9d6a-7f3b2e851c04" },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`ip` 缺漏或格式不合法
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 新增成功

- **WHEN** SUPERADMIN 送 `{ "ip": "1.2.3.4", "reason": "brute force" }`
- **THEN** 回 `201`，`data.id` 為新建紀錄 uuid，`isAutoBlock` 為 `false`

#### Scenario: 重複 IP 為更新而非報錯

- **WHEN** 對已存在的 `ipAddress` 再次送出
- **THEN** 回 `201`，`data.id` 為既有紀錄 id，黑名單總筆數不變

#### Scenario: 人工重加自動封鎖的 IP 轉為人工

- **WHEN** 對一筆 `isAutoBlock: true` 的紀錄由本 endpoint 再次送出
- **THEN** 回 `201`，該紀錄 `isAutoBlock` 變為 `false`

### Requirement: 查詢單筆 IP 黑名單

`GET /api/admin/security/ip-blacklist/:id` SHALL 回傳單筆黑名單紀錄，供編輯 dialog 帶初值。

**Request**（path）：`id: string (uuid)`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "c82a1f3d-0b45-4e29-9d6a-7f3b2e851c04",
    "ipAddress": "10.0.0.1",
    "reason": "異常登入嘗試",
    "isAutoBlock": false,
    "createdBy": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
    "createdAt": "2026-08-16T06:00:00.000Z"
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`id` 非合法 uuid
- `404`、`code: "IP_LIST_NOT_FOUND"`：紀錄不存在
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 找到紀錄

- **WHEN** SUPERADMIN 打 `GET /api/admin/security/ip-blacklist/<uuid>` 且紀錄存在
- **THEN** 回 `200`，`data` 為單筆黑名單形狀

#### Scenario: 紀錄不存在

- **WHEN** 該 uuid 不存在
- **THEN** 回 `404`、`code: "IP_LIST_NOT_FOUND"`

### Requirement: 更新 IP 黑名單

`PATCH /api/admin/security/ip-blacklist/:id` SHALL 更新黑名單的可變欄位（目前僅 `reason`）。
`ipAddress` 與 `isAutoBlock` MUST NOT 可變——`isAutoBlock` 代表這筆紀錄的**來源**，
是稽核事實而非設定值，能改就失去區分自動與人工封鎖的意義。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path `id: string (uuid)`；body 全部選填）：

```json
{ "reason": "持續嘗試暴力破解" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`id` 非合法 uuid
- `404`、`code: "IP_LIST_NOT_FOUND"`：紀錄不存在
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 更新成功

- **WHEN** SUPERADMIN 送 `{ "reason": "新理由" }`
- **THEN** 回 `204`，該紀錄 `reason` 更新

#### Scenario: isAutoBlock 不受影響

- **WHEN** 對一筆 `isAutoBlock: true` 的紀錄 PATCH `reason`
- **THEN** 回 `204`，該紀錄 `isAutoBlock` MUST 維持 `true`

#### Scenario: 紀錄不存在

- **WHEN** 該 uuid 不存在
- **THEN** 回 `404`、`code: "IP_LIST_NOT_FOUND"`

### Requirement: 從黑名單移除 IP（硬刪除且靜默）

`DELETE /api/admin/security/ip-blacklist/:id` SHALL 移除指定紀錄，
行為與白名單移除完全對應：硬刪除、紀錄不存在時靜默回 `204`。

**Request**（path）：`id: string (uuid)`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`id` 非合法 uuid
- 其餘見「SUPERADMIN role gate」。**不會回 404。**

#### Scenario: 刪除成功

- **WHEN** SUPERADMIN 打 `DELETE /api/admin/security/ip-blacklist/<uuid>`
- **THEN** 回 `204`，資料列自 DB 直接消失

#### Scenario: 紀錄不存在靜默通過

- **WHEN** 該 uuid 不存在
- **THEN** 回 `204`，MUST NOT 回 404

### Requirement: 帳號解鎖

`POST /api/admin/security/unlock-account` SHALL 解除因登入失敗次數超過閾值而被鎖定的帳號。
成功 MUST 同時將 `lockedAt` 設為 `null` 且 `failedLoginCount` 歸零——
只清其一會讓帳號在下一次失敗就立刻重新被鎖。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（body，`email` 必填）：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`email` 缺漏或格式不合法
- `404`、`code: "EMAIL_NOT_FOUND"`：查無該 Email 的帳號
- `409`、`code: "ACCOUNT_NOT_LOCKED"`：帳號存在但 `lockedAt` 為 `null`
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 解鎖成功

- **WHEN** SUPERADMIN 對被鎖帳號送 `{ "email": "locked@example.com" }`
- **THEN** 回 `204`，該帳號 `lockedAt` 為 `null` 且 `failedLoginCount` 為 `0`

#### Scenario: 帳號不存在

- **WHEN** 該 Email 沒有對應帳號
- **THEN** 回 `404`、`code: "EMAIL_NOT_FOUND"`

#### Scenario: 帳號未鎖

- **WHEN** 該帳號存在但 `lockedAt` 為 `null`
- **THEN** 回 `409`、`code: "ACCOUNT_NOT_LOCKED"`
