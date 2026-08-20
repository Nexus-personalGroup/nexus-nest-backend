# api-member-management Specification

## Purpose

定義後台「帳號管理」的全部 endpoint 契約（`/api/admin/members/*`），共七支：
列表、詳情、建立、更新、刪除，以及帳號建立／編輯 Modal 的角色 Combobox 專用的
兩支角色選項 endpoint。

角色選項那兩支刻意留在本 capability 而非 `api-role-management`：它們服務的是
「帳號管理者」場景，只要 `BACKEND:ACCOUNT:VIEW` 權限、回傳欄位窄化為
`{ id, name, isAssignable }`，與角色 CRUD 的權限和資料範圍都不同。

前端畫面行為見 `ui-member-management`；錯誤回應的通用形狀見
`platform-api-error-response`。

## Requirements

### Requirement: 帳號列表查詢

`GET /api/admin/members` SHALL 以分頁回傳帳號清單，支援名稱、Email 模糊搜尋與啟用狀態
過濾，多個條件同時給定時 MUST 取交集。MUST 要求 JWT Bearer Token 與
`BACKEND:ACCOUNT:VIEW` 權限。軟刪除（`deletedAt != null`）的帳號 MUST NOT 出現，
與 `status` 參數無關。

**Request**（query）：

- `page?: integer` — 頁碼，預設 1，最小 1
- `limit?: integer` — 每頁筆數，上限 200，未指定時取環境變數 `DEFAULT_PAGE_LIMIT`
- `name?: string` — 名稱模糊搜尋
- `email?: string` — Email 模糊搜尋
- `status?: boolean` — 啟用狀態過濾。以 zod `z.enum(['true', 'false'])` 嚴格解析，
  **省略即不過濾**（同時回啟用與停用），非 `'true' | 'false'` 的值 MUST 回 400

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
        "email": "user@example.com",
        "member": "王小明",
        "roleId": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443",
        "roleName": "管理員",
        "status": true,
        "isDefault": false,
        "createdAt": "2026-08-16T06:00:00.000Z",
        "updatedAt": "2026-08-16T06:00:00.000Z",
        "lastLoginAt": "2026-08-16T05:30:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`status` 非 `'true' | 'false'`，或 `page` / `limit` 非正整數
- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:VIEW`

#### Scenario: 未帶 status 不過濾

- **WHEN** 已登入且具 VIEW 權限者打 `GET /api/admin/members`
- **THEN** 回 `200`，`data.list` 同時包含啟用與停用帳號

#### Scenario: status=true 僅回啟用

- **WHEN** 打 `GET /api/admin/members?status=true`
- **THEN** 回 `200`，`data.list` 每筆 `status === true`

#### Scenario: status=false 僅回停用

- **WHEN** 打 `GET /api/admin/members?status=false`
- **THEN** 回 `200`，`data.list` 每筆 `status === false`

#### Scenario: 多條件取交集

- **WHEN** 打 `GET /api/admin/members?status=false&name=admin`
- **THEN** 回 `200`，`data.list` 僅含「停用且名稱含 admin」者，`meta.total` 反映套用全部條件後的筆數

#### Scenario: 非法 status 值

- **WHEN** 打 `GET /api/admin/members?status=foo`
- **THEN** 回 `400`（zod enum 拒絕非 `'true' | 'false'` 的值）

#### Scenario: 軟刪除不出現

- **WHEN** 某帳號 `deletedAt != null`
- **THEN** 任何 `status` 參數組合下都 MUST NOT 出現在 `data.list`

#### Scenario: 無 token

- **WHEN** 未帶 Authorization header
- **THEN** 回 `401`

#### Scenario: 無 VIEW 權限

- **WHEN** 已登入但缺 `BACKEND:ACCOUNT:VIEW`
- **THEN** 回 `403`

### Requirement: 帳號詳情查詢

`GET /api/admin/members/:id` SHALL 回傳單一帳號完整資料，供編輯 Modal 帶入。
MUST 要求 `BACKEND:ACCOUNT:VIEW`。

**Request**（path）：`id: string (uuid)`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
    "email": "user@example.com",
    "member": "王小明",
    "roleId": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443",
    "roleName": "管理員",
    "status": true,
    "isDefault": false,
    "createdAt": "2026-08-16T06:00:00.000Z",
    "updatedAt": "2026-08-16T06:00:00.000Z",
    "lastLoginAt": "2026-08-16T05:30:00.000Z"
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:VIEW`
- `404`、`code: "MEMBER_NOT_FOUND"`：帳號不存在或已軟刪除

#### Scenario: 取得帳號詳情

- **WHEN** 具 VIEW 權限者打 `GET /api/admin/members/<uuid>` 且該帳號存在
- **THEN** 回 `200` 與完整欄位

#### Scenario: 帳號不存在

- **WHEN** `:id` 不存在或該帳號已軟刪除
- **THEN** 回 `404`、`code: "MEMBER_NOT_FOUND"`

### Requirement: 建立帳號

`POST /api/admin/members` SHALL 建立新帳號，成功回 `201` 與新帳號 ID。
MUST 要求 `BACKEND:ACCOUNT:EDIT`。Email MUST 唯一（比對未軟刪除者），
`roleId` MUST 存在於 roles 表。密碼 MUST 依 `PASSWORD_COMPLEXITY_LEVEL` 的策略檢核。

**Request**（body，`email` / `member` / `password` / `roleId` 必填）：

```json
{
  "email": "user@example.com",
  "member": "王小明",
  "password": "Passw0rd!",
  "roleId": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443",
  "status": true
}
```

- `email: string` — Email 格式，最長 255
- `member: string` — 1–100 字元
- `password: string` — 8–30 字元，須通過密碼複雜度策略
- `roleId: string (uuid)`
- `status?: boolean` — 初始啟用狀態，預設 `true`

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": { "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31" },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：欄位驗證失敗（Email 格式、名稱長度、密碼長度或複雜度）
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:EDIT`
- `404`、`code: "ROLE_NOT_FOUND"`：`roleId` 不存在
- `409`、`code: "EMAIL_ALREADY_EXISTS"`：Email 已被使用

#### Scenario: 建立成功

- **WHEN** 具 EDIT 權限者送出合法 body
- **THEN** 回 `201`，`data.id` 為新帳號 ID

#### Scenario: 未給 status 預設啟用

- **WHEN** body 未包含 `status`
- **THEN** 建立出的帳號 `status` 為 `true`

#### Scenario: Email 重複

- **WHEN** `email` 已被未軟刪除的帳號使用
- **THEN** 回 `409`、`code: "EMAIL_ALREADY_EXISTS"`，不建立

#### Scenario: 角色不存在

- **WHEN** `roleId` 不存在於 roles 表
- **THEN** 回 `404`、`code: "ROLE_NOT_FOUND"`，不建立

#### Scenario: 密碼不符複雜度

- **WHEN** `password` 未通過 `PASSWORD_COMPLEXITY_LEVEL` 的檢核
- **THEN** 回 `400`，不建立

#### Scenario: 無 EDIT 權限

- **WHEN** 已登入但僅有 `BACKEND:ACCOUNT:VIEW`
- **THEN** 回 `403`

### Requirement: 更新帳號

`PATCH /api/admin/members/:id` SHALL 以**真 partial** 語意更新帳號：所有欄位皆選填，
僅送出有變動的欄位即可，避免為改一欄而回送整列造成併發互相覆蓋。
`password` 未指定或空白表示不改。MUST 要求 `BACKEND:ACCOUNT:EDIT`。

成功 MUST 回 `204 No Content`，**沒有回應主體**——不套用 `{ success, data, timestamp }` wrapper。

**Request**（path `id: string (uuid)`；body 全部選填）：

```json
{
  "email": "user@example.com",
  "member": "王小明",
  "password": "Passw0rd!",
  "roleId": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443",
  "status": false
}
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：欄位驗證失敗
- `400`、`code: "CANNOT_DISABLE_SELF"`：嘗試把自己的帳號改為停用
- `400`、`code: "DEFAULT_MEMBER_NOT_EDITABLE"`：目標為預設帳號
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:EDIT`
- `404`、`code: "MEMBER_NOT_FOUND"`：帳號不存在
- `404`、`code: "ROLE_NOT_FOUND"`：`roleId` 不存在
- `409`、`code: "EMAIL_ALREADY_EXISTS"`：Email 已被其他帳號使用

#### Scenario: 更新成功不回 body

- **WHEN** 具 EDIT 權限者 PATCH 合法 body
- **THEN** 回 `204` 且回應無 body

#### Scenario: 只送單一欄位

- **WHEN** body 只含 `{ "member": "新名稱" }`
- **THEN** 回 `204`，且該帳號其餘欄位 MUST 保持不變

#### Scenario: 空白密碼不改密碼

- **WHEN** body 的 `password` 為空字串或未提供
- **THEN** 回 `204`，該帳號密碼 MUST 維持原值

#### Scenario: 不可停用自己

- **WHEN** 使用者對自己的帳號送 `{ "status": false }`
- **THEN** 回 `400`、`code: "CANNOT_DISABLE_SELF"`，不更新

#### Scenario: 預設帳號不可編輯

- **WHEN** 目標帳號 `isDefault` 為 `true`
- **THEN** 回 `400`、`code: "DEFAULT_MEMBER_NOT_EDITABLE"`，不更新

#### Scenario: Email 與他人重複

- **WHEN** `email` 已被其他未軟刪除的帳號使用
- **THEN** 回 `409`、`code: "EMAIL_ALREADY_EXISTS"`，不更新

### Requirement: 刪除帳號（軟刪除）

`DELETE /api/admin/members/:id` SHALL 對帳號執行軟刪除：資料列保留，
`deletedAt` 寫入時間，且 Email MUST 改寫為 `原值_時間戳記` 以釋放唯一約束，
使同一 Email 日後可再次註冊。MUST 要求 `BACKEND:ACCOUNT:EDIT`。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path）：`id: string (uuid)`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`、`code: "CANNOT_DELETE_SELF"`：嘗試刪除自己的帳號
- `400`、`code: "DEFAULT_MEMBER_NOT_DELETABLE"`：目標為預設帳號
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:EDIT`
- `404`、`code: "MEMBER_NOT_FOUND"`：帳號不存在或已軟刪除

#### Scenario: 刪除成功並釋放 Email

- **WHEN** 具 EDIT 權限者刪除一個非預設、非自己的帳號
- **THEN** 回 `204`；該列 `deletedAt` 有值，Email 改為 `原值_時間戳記`，且原 Email 可再次用於建立帳號

#### Scenario: 不可刪除自己

- **WHEN** 使用者刪除自己的帳號
- **THEN** 回 `400`、`code: "CANNOT_DELETE_SELF"`，不刪除

#### Scenario: 預設帳號不可刪除

- **WHEN** 目標帳號 `isDefault` 為 `true`
- **THEN** 回 `400`、`code: "DEFAULT_MEMBER_NOT_DELETABLE"`，不刪除

#### Scenario: 重複刪除

- **WHEN** 對已軟刪除的帳號再次呼叫
- **THEN** 回 `404`、`code: "MEMBER_NOT_FOUND"`

### Requirement: 角色選項分頁查詢

`GET /api/admin/members/role/options` SHALL 分頁回傳「啟用中且未軟刪除」
（`status: true` 且 `deletedAt: null`）的角色，供帳號建立／編輯 Modal 的角色
Combobox 使用。排序依 `createdAt` 遞增。MUST 只要求 `BACKEND:ACCOUNT:VIEW`
（不要求 `BACKEND:ROLE:VIEW`），讓沒有角色管理權限的帳號管理者也能取用。

每筆的 `isAssignable` MUST 由後端推導（現行規則：`roleCode === 'SUPERADMIN'` 視為
不可指派）。**MUST NOT 回傳 `roleCode`**——RBAC 判斷規則不外洩到前端，前端只依
`isAssignable` 決定是否 disabled。

**Request**（query）：

- `page?: integer` — 預設 1，須為正整數
- `limit?: integer` — 預設 20，上限 100
- `search?: string` — 名稱模糊搜尋；trim 後為空字串視為未提供

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      { "id": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443", "name": "管理員", "isAssignable": true }
    ],
    "meta": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:VIEW`

#### Scenario: 預設分頁

- **WHEN** 具 VIEW 權限者打 `GET /api/admin/members/role/options`（無 query）
- **THEN** 回 `200`，`meta.page` 為 1、`meta.limit` 為 20

#### Scenario: 指定 page 與 limit

- **WHEN** 打 `?page=2&limit=10`
- **THEN** 回 `200`，`data.list` 為第 2 頁前 10 筆，`meta.page` 為 2、`meta.limit` 為 10

#### Scenario: 名稱搜尋

- **WHEN** 打 `?search=admin`
- **THEN** 回 `200`，`data.list` 僅含名稱模糊命中 `admin` 者，`meta.total` 反映搜尋後筆數

#### Scenario: search 空字串視為未提供

- **WHEN** 打 `?search=`
- **THEN** 回 `200`，結果等同不帶 `search`

#### Scenario: 停用與軟刪除的角色不出現

- **WHEN** 某角色 `status: false` 或 `deletedAt != null`
- **THEN** MUST NOT 出現在 `data.list`

#### Scenario: 不外洩 roleCode

- **WHEN** 任一筆角色選項回傳
- **THEN** 該物件 MUST 僅含 `id` / `name` / `isAssignable`，MUST NOT 含 `roleCode`

### Requirement: 角色選項單筆查詢（fallback）

`GET /api/admin/members/role/options/:id` SHALL 回傳單一啟用中角色的選項形狀，
供前端「編輯時既有 `roleId` 不在分頁第一頁」的 fallback 取用。
回傳形狀 MUST 與分頁版一致。MUST 只要求 `BACKEND:ACCOUNT:VIEW`。

與 `GET /api/admin/roles/:id` 區隔：本 endpoint 的權限與欄位都窄化，
不含 `permissionCodes`、`createdAt` 等角色管理才需要的資料。

**Request**（path）：`id: string (uuid)`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": { "id": "9a1e4c77-5b20-43d8-9f6a-c018e2b7d443", "name": "管理員", "isAssignable": true },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ACCOUNT:VIEW`
- `404`、`code: "ROLE_NOT_FOUND"`：角色不存在、已軟刪除，或 `status: false`

#### Scenario: 找到啟用角色

- **WHEN** 具 VIEW 權限者打 `GET /api/admin/members/role/options/<uuid>`，該角色 `status: true` 且未軟刪除
- **THEN** 回 `200`，`data` 為 `{ id, name, isAssignable }`

#### Scenario: 角色停用或不存在

- **WHEN** 該角色不存在、已軟刪除，或 `status: false`
- **THEN** 回 `404`、`code: "ROLE_NOT_FOUND"`

### Requirement: 固定路由優先於參數路由

`role/options` 與 `role/options/:id` 這兩條固定路徑 MUST 宣告於 `:id` 參數路由之前，
否則 `GET /api/admin/members/role` 會被 `GET /api/admin/members/:id` 攔截，
把字串 `role` 當成帳號 ID 而回 `404` 或驗證錯誤。

#### Scenario: 角色選項不被帳號詳情攔截

- **WHEN** 打 `GET /api/admin/members/role/options`
- **THEN** 由角色選項 handler 處理並回 `200`，MUST NOT 落到帳號詳情 handler
