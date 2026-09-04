## MODIFIED Requirements

### Requirement: 建立角色

`POST /api/admin/roles` SHALL 建立角色並指派權限，成功回 `201` 與新角色 ID。
MUST 要求 `BACKEND:ROLE:EDIT`。角色名稱 MUST 唯一（比對未軟刪除者）。
`permissionCodes` 的每個值 MUST 存在於權限目錄，且 **EDIT 類權限在同模組**
**也提供 VIEW 時** MUST 搭配該 VIEW 權限——只能編輯卻看不到的組合無意義，MUST 於此擋下。

⚠️ **「同模組也提供 VIEW」這個前提不可省。** 有些模組刻意只有 EDIT
（附件只有 `BACKEND:ATTACHMENT:EDIT`——上傳與刪除都是寫入操作，沒有「只能看」的場景）。
無條件要求 VIEW 會**索取一個目錄裡不存在的權限碼**，
使該權限**永遠不可能被指派給任何角色**：它存在於目錄、畫得出來、就是存不進去。

判斷 MUST 依權限目錄，MUST NOT 以字串推導（`X:Y:EDIT` → `X:Y:VIEW`）。
驗證流程本來就要查目錄確認每個碼存在，**同一份資料就能回答這個問題**。

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
- `400`、`code: "INVALID_PERMISSION_COMBINATION"`：有 EDIT 但缺同模組的 VIEW（僅在該模組也提供 VIEW 時）
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

#### Scenario: ⭐ 模組只提供 EDIT

- **WHEN** `permissionCodes` 含 `BACKEND:ATTACHMENT:EDIT`，
  而權限目錄中沒有 `BACKEND:ATTACHMENT:VIEW`
- **THEN** 回 `201` 建立成功——MUST NOT 要求一個不存在的權限碼

#### Scenario: 不指派任何權限

- **WHEN** body 省略 `permissionCodes` 或給空陣列
- **THEN** 回 `201`，該角色沒有任何權限
