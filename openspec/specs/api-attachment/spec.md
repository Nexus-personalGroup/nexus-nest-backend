# api-attachment Specification

## Purpose

定義後台「附件上傳」的 endpoint 契約（`/api/admin/attachments`），共兩支：上傳與刪除。

本 capability 的重點不在 CRUD 而在**上傳安全**。檔案上傳是把使用者提供的位元組
放進由自己網域提供的路徑，任何一處把關失守都可能變成 stored XSS 或內容嗅探攻擊，
因此白名單、副檔名推導與大小上限都寫成規範性要求，而非實作細節。

儲存後端（local / s3）的切換與靜態服務見 `openspec/project/backend-utilities.md` 的「檔案儲存與上傳安全」。

## Requirements

### Requirement: 上傳附件

`POST /api/admin/attachments` SHALL 以 `multipart/form-data` 接收**單一**檔案，
成功回 `201` 與附件 ID 及可存取 URL。MUST 要求 `BACKEND:ATTACHMENT:EDIT` 權限。
檔案欄位名 MUST 固定為 `file`；未提供檔案 MUST 回 `400`、`code: "INVALID_UPLOAD"`。

MUST 記錄上傳者（由 JWT 取得），以及 `relatedTable` / `relatedId` 的歸屬關係。

**Request**（`multipart/form-data`，四欄皆必填）：

- `file: binary` — 上傳檔案，欄位名固定為 `file`
- `folder: string` — 上傳資料夾，MUST 為白名單值：`avatars` | `attachments`
- `relatedTable: string` — 附屬的資料表名稱，例 `members`
- `relatedId: string` — 附屬的紀錄 ID

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": {
    "id": "d43b8e15-2c67-4f80-a91d-5b0c7e3a2f68",
    "url": "/media/avatars/9f2c4a7b1e.jpg"
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`、`code: "INVALID_UPLOAD"`：未提供檔案、MIME 不在白名單、**檔案內容與宣告的
  MIME 不符**（magic byte 比對）、超過大小上限，或 `folder` 不在白名單
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ATTACHMENT:EDIT`
- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Access Token
- `413`：檔案大小超過 multer 的硬上限（在進入應用層驗證之前即被擋下）

#### Scenario: 上傳成功

- **WHEN** 已登入者以合法 MIME、合法 `folder` 上傳一個未超過上限的檔案
- **THEN** 回 `201`，`data` 含 `id` 與可存取的 `url`

#### Scenario: 未提供檔案

- **WHEN** 請求未帶 `file` 欄位，或欄位名不是 `file`
- **THEN** 回 `400`、`code: "INVALID_UPLOAD"`

#### Scenario: 未登入

- **WHEN** 未帶 Authorization header
- **THEN** 回 `401`

### Requirement: 上傳白名單與副檔名推導（安全核心）

上傳 MUST 通過三道白名單，任何一道未過即拒絕寫入儲存後端：

1. **MIME 白名單** —— 僅接受 `EXT_BY_MIME` 表列的類型：
   `image/jpeg`、`image/png`、`image/webp`、`image/gif`、`application/pdf`。
2. **資料夾白名單** —— `folder` 僅接受 `avatars` 與 `attachments`。
   此欄會參與儲存路徑組成，未經白名單就可能被用來做路徑穿越。
3. **大小上限** —— 由環境變數 `MAX_UPLOAD_BYTES` 控制，並另有 multer 層的硬上限，
   使超大檔案在讀入記憶體前就被截斷。

**副檔名 MUST 由通過驗證的 MIME 推導（`EXT_BY_MIME`），MUST NOT 取用 client 的原始檔名。**
原始檔名是完全由攻擊者控制的字串，取用它會讓 `evil.png.html` 這類檔案以 HTML 被服務出去，
形成同源的 stored XSS。原始檔名可保存作為顯示用途，但 MUST NOT 參與實際儲存路徑的組成。

#### Scenario: MIME 不在白名單

- **WHEN** 上傳 `text/html` 或 `application/x-msdownload` 等未列入的類型
- **THEN** 回 `400`、`code: "INVALID_UPLOAD"`，MUST NOT 寫入儲存後端

#### Scenario: 副檔名不取原始檔名

- **WHEN** 上傳一個原始檔名為 `evil.png.html` 但 MIME 為 `image/png` 的檔案
- **THEN** 實際儲存的檔名副檔名 MUST 為 `.png`（由 MIME 推導），MUST NOT 為 `.html`

#### Scenario: 資料夾不在白名單

- **WHEN** `folder` 為 `../../etc` 或其他未列入的值
- **THEN** 回 `400`、`code: "INVALID_UPLOAD"`，MUST NOT 寫入

#### Scenario: 超過大小上限

- **WHEN** 檔案大小超過 `MAX_UPLOAD_BYTES`
- **THEN** 回 `400`、`code: "INVALID_UPLOAD"`（或於 multer 硬上限被擋時回 `413`），MUST NOT 寫入

### Requirement: 刪除附件

`DELETE /api/admin/attachments/:id` SHALL 依 ID 刪除附件，
**同時刪除儲存後端的實體檔案與資料庫紀錄**——只刪其一會留下孤兒檔案或斷掉的 URL。
`id` 由 `ParseUUIDPipe` 驗證。MUST 要求 `BACKEND:ATTACHMENT:EDIT` 權限，
且 MUST 另做**擁有者檢查**：非上傳者僅 `SUPERADMIN` 可刪。
權限碼只能擋「有沒有資格碰附件」，擋不住「有資格的 A 刪掉 B 的附件」——
刪除不可逆、會一併移除實體檔案，而附件 ID 隨上傳回應外流，能看到 ID 的人就能刪。

與 IP 名單的刪除不同，本 endpoint 找不到紀錄時 MUST 回 `404` 而非靜默通過：
附件刪除多半由使用者明確操作觸發，靜默成功會讓「刪錯了」與「早就不存在」無法區分。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path）：`id: string (uuid)`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`id` 非合法 uuid（`ParseUUIDPipe`）
- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Access Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ATTACHMENT:EDIT`
- `403`、`code: "ATTACHMENT_FORBIDDEN"`：非上傳者且非 SUPERADMIN
- `404`、`code: "ATTACHMENT_NOT_FOUND"`：附件不存在

#### Scenario: 刪除成功

- **WHEN** 已登入者刪除一個存在的附件
- **THEN** 回 `204`，DB 紀錄與儲存後端的實體檔案皆被移除

#### Scenario: 非上傳者不得刪除

- **WHEN** 具 `BACKEND:ATTACHMENT:EDIT` 但非上傳者、亦非 SUPERADMIN 者刪除他人附件
- **THEN** 回 `403`、`code: "ATTACHMENT_FORBIDDEN"`，附件與實體檔案 MUST 保留

#### Scenario: SUPERADMIN 可刪他人附件

- **WHEN** `roleCode` 為 `SUPERADMIN` 者刪除他人上傳的附件
- **THEN** 回 `204`，附件與實體檔案皆被移除

#### Scenario: 附件不存在

- **WHEN** 該 uuid 沒有對應的附件
- **THEN** 回 `404`、`code: "ATTACHMENT_NOT_FOUND"`

#### Scenario: 非法 ID 格式

- **WHEN** `:id` 不是合法 uuid
- **THEN** 回 `400`
