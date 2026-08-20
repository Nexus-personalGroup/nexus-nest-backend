# api-role-management Specification

## Purpose

定義後台「角色管理」的全部 endpoint 契約（`/api/admin/roles/*`），共六支：
列表、詳情、建立、更新、刪除，以及供角色建立／編輯 Modal 使用的可用 permission 清單。

角色與 RBAC 權限碼的關係：permission 由 `PERMISSION_CATALOG` 單一真相衍生，
角色只持有 `permissionCodes` 的集合。帳號管理場景要用的角色下拉選項**不在本 capability**，
在 `api-member-management`——那組 endpoint 的權限與欄位都刻意窄化。

前端畫面行為見 `ui-role-management`。Swagger 與 `@app/api-client` 的同步義務由
`platform-api-client-generation` 統一規範，本 spec 不逐條重述。

## Requirements

### Requirement: 角色列表查詢

`GET /api/admin/roles` SHALL 以分頁回傳角色清單，支援名稱模糊搜尋與啟用狀態過濾，
多條件同時給定時 MUST 取交集。每筆 MUST 帶 `memberCount`（該角色目前的帳號數，
供前端顯示與刪除守門提示）。MUST 要求 `BACKEND:ROLE:VIEW`。
軟刪除（`deletedAt != null`）的角色 MUST NOT 出現，與 `status` 無關。

**Request**（query）：

- `page?: integer` — 預設 1
- `limit?: integer` — 上限 200，未指定時取 `DEFAULT_PAGE_LIMIT`
- `name?: string` — 名稱模糊搜尋
- `status?: boolean` — 以 zod `z.enum(['true', 'false'])` 嚴格解析；省略即不過濾

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443",
        "name": "管理員",
        "status": true,
        "isDefault": false,
        "memberCount": 3,
        "createdAt": "2026-08-16T06:00:00.000Z",
        "updatedAt": "2026-08-16T06:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 4, "totalPages": 1 }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`status` 非 `'true' | 'false'`，或 `page` / `limit` 非正整數
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:VIEW`

#### Scenario: 未帶 status 不過濾

- **WHEN** 具 VIEW 權限者打 `GET /api/admin/roles`
- **THEN** 回 `200`，`data.list` 同時包含啟用與停用角色

#### Scenario: status=true 僅回啟用

- **WHEN** 打 `?status=true`
- **THEN** 回 `200`，`data.list` 每筆 `status === true`

#### Scenario: status=false 僅回停用

- **WHEN** 打 `?status=false`
- **THEN** 回 `200`，`data.list` 每筆 `status === false`

#### Scenario: 與 name 並用為交集

- **WHEN** 打 `?status=false&name=admin`
- **THEN** 回 `200`，`data.list` 僅含「停用且名稱含 admin」者

#### Scenario: 非法 status 值

- **WHEN** 打 `?status=foo`
- **THEN** 回 `400`

#### Scenario: 帶出帳號數

- **WHEN** 某角色目前被 3 個未軟刪除的帳號使用
- **THEN** 該筆 `memberCount` 為 `3`

### Requirement: 角色詳情查詢

`GET /api/admin/roles/:id` SHALL 回傳單一角色詳情，含已指派的 `permissionCodes`，
供編輯 Modal 帶入。MUST 要求 `BACKEND:ROLE:VIEW`。

**Request**（path）：`id: string (uuid)`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443",
    "name": "管理員",
    "status": true,
    "isDefault": false,
    "permissionCodes": ["BACKEND:ACCOUNT:VIEW", "BACKEND:ACCOUNT:EDIT"],
    "createdAt": "2026-08-16T06:00:00.000Z",
    "updatedAt": "2026-08-16T06:00:00.000Z"
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:VIEW`
- `404`、`code: "ROLE_NOT_FOUND"`：角色不存在或已軟刪除

#### Scenario: 取得角色詳情

- **WHEN** 具 VIEW 權限者打 `GET /api/admin/roles/<uuid>` 且角色存在
- **THEN** 回 `200`，`data.permissionCodes` 為該角色已指派的權限碼陣列

#### Scenario: 角色不存在

- **WHEN** `:id` 不存在或已軟刪除
- **THEN** 回 `404`、`code: "ROLE_NOT_FOUND"`

### Requirement: 可用 Permission 清單查詢

`GET /api/admin/roles/permissions` SHALL 回傳系統中所有啟用（`status: true`）的
permission，供角色建立／編輯 Modal 的權限勾選樹使用。MUST 要求 `BACKEND:ROLE:VIEW`。
回傳為**陣列**而非分頁物件——權限碼由 `PERMISSION_CATALOG` 衍生，數量有界。

本固定路由 MUST 宣告於 `:id` 參數路由之前，否則會被角色詳情攔截，
把字串 `permissions` 當作角色 ID。

**Request**：無參數。

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": [
    {
      "permissionCode": "BACKEND:ACCOUNT:VIEW",
      "name": "帳號檢視",
      "platform": "BACKEND",
      "module": "ACCOUNT",
      "action": "VIEW"
    }
  ],
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:VIEW`

#### Scenario: 取得權限清單

- **WHEN** 具 VIEW 權限者打 `GET /api/admin/roles/permissions`
- **THEN** 回 `200`，`data` 為陣列，每筆含 `permissionCode` / `name` / `platform` / `module` / `action`

#### Scenario: 停用的權限不出現

- **WHEN** 某 permission `status: false`
- **THEN** MUST NOT 出現在 `data`

#### Scenario: 不被角色詳情攔截

- **WHEN** 打 `GET /api/admin/roles/permissions`
- **THEN** 由權限清單 handler 處理，MUST NOT 落到 `GET /api/admin/roles/:id`

### Requirement: 建立角色

`POST /api/admin/roles` SHALL 建立角色並指派權限，成功回 `201` 與新角色 ID。
MUST 要求 `BACKEND:ROLE:EDIT`。角色名稱 MUST 唯一（比對未軟刪除者）。
`permissionCodes` 的每個值 MUST 存在於權限目錄，且 **EDIT 類權限 MUST 搭配同模組的
VIEW 權限**——只能編輯卻看不到的組合無意義，MUST 於此擋下。

**Request**（body，`name` 必填）：

```json
{
  "name": "審核人員",
  "permissionCodes": ["BACKEND:ACCOUNT:VIEW", "BACKEND:ACCOUNT:EDIT"]
}
```

- `name: string` — 1–100 字元
- `permissionCodes?: string[]` — 省略或空陣列表示不指派任何權限

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": { "id": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443" },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`name` 長度不合法
- `400`、`code: "INVALID_PERMISSION_CODE"`：`permissionCodes` 含不存在的權限碼
- `400`、`code: "INVALID_PERMISSION_COMBINATION"`：有 EDIT 但缺同模組的 VIEW
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:EDIT`
- `409`、`code: "DUPLICATE_ROLE_NAME"`：角色名稱已存在

#### Scenario: 建立成功

- **WHEN** 具 EDIT 權限者送出合法 `name` 與 `permissionCodes`
- **THEN** 回 `201`，`data.id` 為新角色 ID，權限依 `permissionCodes` 指派

#### Scenario: 名稱重複

- **WHEN** `name` 已被未軟刪除的角色使用
- **THEN** 回 `409`、`code: "DUPLICATE_ROLE_NAME"`，不建立

#### Scenario: 權限碼不存在

- **WHEN** `permissionCodes` 含權限目錄中沒有的碼
- **THEN** 回 `400`、`code: "INVALID_PERMISSION_CODE"`，不建立

#### Scenario: EDIT 未搭配 VIEW

- **WHEN** `permissionCodes` 含 `BACKEND:ACCOUNT:EDIT` 但不含 `BACKEND:ACCOUNT:VIEW`
- **THEN** 回 `400`、`code: "INVALID_PERMISSION_COMBINATION"`，不建立

#### Scenario: 不指派任何權限

- **WHEN** body 省略 `permissionCodes` 或給空陣列
- **THEN** 回 `201`，該角色沒有任何權限

### Requirement: 更新角色

`PATCH /api/admin/roles/:id` SHALL 更新角色的 `name`、`permissionCodes` 或 `status`，
三者均為選填：**省略表示不變更**，`permissionCodes` 傳空陣列 `[]` 表示清空所有權限。
MUST 要求 `BACKEND:ROLE:EDIT`。預設角色（`isDefault === true`）MUST 拒絕編輯。

多欄位同送時 MUST 在**同一個資料庫 transaction** 內完成，
不得留下「name 已改但 status 未改」的中間狀態。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path `id: string (uuid)`；body 全部選填）：

```json
{
  "name": "審核人員",
  "permissionCodes": ["BACKEND:ACCOUNT:VIEW"],
  "status": false
}
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`name` 長度不合法，或 `status` 非 boolean
- `400`、`code: "DEFAULT_ROLE_NOT_EDITABLE"`：目標為預設角色
- `400`、`code: "INVALID_PERMISSION_CODE"`：含不存在的權限碼
- `400`、`code: "INVALID_PERMISSION_COMBINATION"`：有 EDIT 但缺同模組的 VIEW
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:EDIT`
- `404`、`code: "ROLE_NOT_FOUND"`：角色不存在
- `409`、`code: "DUPLICATE_ROLE_NAME"`：新名稱已被其他角色使用

#### Scenario: 僅切換 status

- **WHEN** 對非預設角色 PATCH `{ "status": false }`
- **THEN** 回 `204`，該角色 `status` 變 `false`，`name` 與權限保持不變

#### Scenario: name 與 status 同送具原子性

- **WHEN** body 為 `{ "name": "審核人員", "status": true }`
- **THEN** 回 `204`，`name` 與 `status` 於同一 transaction 內同時生效，權限不變

#### Scenario: 清空權限

- **WHEN** body 為 `{ "permissionCodes": [] }`
- **THEN** 回 `204`，該角色所有權限被清空

#### Scenario: 省略欄位不變更

- **WHEN** body 為 `{ "name": "新名稱" }`
- **THEN** 回 `204`，`permissionCodes` 與 `status` MUST 維持原值

#### Scenario: 預設角色不可編輯

- **WHEN** 目標角色 `isDefault === true`
- **THEN** 回 `400`、`code: "DEFAULT_ROLE_NOT_EDITABLE"`，DB 不變

#### Scenario: status 型別錯誤

- **WHEN** body 為 `{ "status": "off" }`
- **THEN** 回 `400`（zod 拒絕非 boolean）

#### Scenario: 名稱與他人重複

- **WHEN** 新 `name` 已被其他未軟刪除的角色使用
- **THEN** 回 `409`、`code: "DUPLICATE_ROLE_NAME"`，不更新

### Requirement: 刪除角色（軟刪除與使用中守門）

`DELETE /api/admin/roles/:id` SHALL 對角色執行軟刪除：資料列保留，
名稱 MUST 加上後綴以釋放唯一約束，使同名角色日後可再建立。
MUST 要求 `BACKEND:ROLE:EDIT`。

兩道守門：預設角色 MUST 拒刪；**仍有帳號使用該角色時 MUST 拒刪**，
避免帳號落到不存在的角色上。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path）：`id: string (uuid)`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`、`code: "DEFAULT_ROLE_NOT_DELETABLE"`：目標為預設角色
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:EDIT`
- `404`、`code: "ROLE_NOT_FOUND"`：角色不存在或已軟刪除
- `409`、`code: "ROLE_HAS_MEMBERS"`：仍有帳號使用該角色，訊息 MUST 帶出帳號數

#### Scenario: 刪除成功並釋放名稱

- **WHEN** 具 EDIT 權限者刪除一個非預設、無帳號使用的角色
- **THEN** 回 `204`；該列 `deletedAt` 有值、名稱加上後綴，且原名稱可再次用於建立角色

#### Scenario: 仍有帳號使用

- **WHEN** 該角色仍被 1 個以上未軟刪除的帳號使用
- **THEN** 回 `409`、`code: "ROLE_HAS_MEMBERS"`，訊息帶出帳號數，不刪除

#### Scenario: 預設角色不可刪除

- **WHEN** 目標角色 `isDefault === true`
- **THEN** 回 `400`、`code: "DEFAULT_ROLE_NOT_DELETABLE"`，不刪除

#### Scenario: 重複刪除

- **WHEN** 對已軟刪除的角色再次呼叫
- **THEN** 回 `404`、`code: "ROLE_NOT_FOUND"`
