# api-auth Specification

## Purpose

定義後台「認證」的全部 endpoint 契約（`/api/admin/auth/*` 與 `/api/admin/me`），共六支：
登入、登出、Token 更新、忘記密碼、重設密碼，以及目前登入者的個人資料查詢。

本 capability 的多數 endpoint 標記 `@Public()`（不經 `JwtAuthGuard`）——它們正是取得
憑證的入口。也因此這裡的失敗回應設計以**不洩漏帳號是否存在**為第一原則：
忘記密碼一律回相同結果，登入失敗不區分「帳號不存在」與「密碼錯誤」。

Token 儲存位置、CORS 與前端的換發流程見 `openspec/project/backend-runtime.md` 的「認證流程」；
錯誤回應的通用形狀見 `platform-api-error-response`。

## Requirements

### Requirement: 登入

`POST /api/admin/auth/login` SHALL 以 Email 與密碼換發 Access Token 與 Refresh Token。
標記 `@Public()`，成功回 `200`（非 201——沒有建立資源）。
MUST 記錄來源 `ip` 與 `user-agent` 供稽核與 IP 封鎖機制使用。

啟用 reCAPTCHA 功能開關時，body MUST 帶 `recaptchaToken` 並通過驗證。

登入失敗 MUST NOT 區分「帳號不存在」與「密碼錯誤」——兩者一律回相同的 `401` 與相同訊息，
否則回應本身就成為帳號列舉的管道。連續失敗達閾值時帳號 MUST 被鎖定。

**Request**（body，`email` / `password` 必填）：

```json
{
  "email": "user@example.com",
  "password": "mypassword123",
  "recaptchaToken": "03AGdBq26..."
}
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresIn": 900,
    "refreshTokenExpiresIn": 604800,
    "member": {
      "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
      "email": "user@example.com",
      "member": "王小明",
      "roleName": "管理員"
    }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`email` 格式不合法或 `password` 缺漏；reCAPTCHA 開啟時缺 `recaptchaToken`
- `401`、`code: "UNAUTHORIZED"`：帳號不存在**或**密碼錯誤（兩者訊息一致）
- `403`、`code: "ACCOUNT_DISABLED"`：帳號 `status` 為 `false`
- `403`、`code: "PASSWORD_CHANGE_REQUIRED"`：帳號被標記為必須先重設密碼
- `423`、`code: "ACCOUNT_LOCKED"`：帳號因連續登入失敗而鎖定

#### Scenario: 登入成功

- **WHEN** 送出正確的 Email 與密碼且帳號啟用中
- **THEN** 回 `200`，`data` 含兩枚 Token、各自的有效秒數與 `member` 摘要

#### Scenario: 密碼錯誤與帳號不存在不可區分

- **WHEN** 分別以「不存在的 Email」與「存在但密碼錯誤」送出
- **THEN** 兩者 MUST 回相同的 `401` 與相同 `message`，回應內容不得讓呼叫端判斷帳號是否存在

#### Scenario: 帳號停用

- **WHEN** 帳號 `status` 為 `false` 且密碼正確
- **THEN** 回 `403`、`code: "ACCOUNT_DISABLED"`

#### Scenario: 帳號鎖定

- **WHEN** 帳號因連續登入失敗被鎖定
- **THEN** 回 `423`、`code: "ACCOUNT_LOCKED"`，即使密碼正確

#### Scenario: 需先重設密碼

- **WHEN** 帳號被標記為必須重設密碼
- **THEN** 回 `403`、`code: "PASSWORD_CHANGE_REQUIRED"`

### Requirement: Token 更新（rotation）

`POST /api/admin/auth/refresh` SHALL 以 Refresh Token 換發**新的 Access Token 與新的
Refresh Token**。標記 `@Public()`，成功回 `200`。

MUST 採 rotation：舊的 Refresh Token 於換發成功後**立即加入黑名單**。
同一枚舊 Refresh Token 再次被使用 MUST 回 `401`——這是偵測 Token 遭竊的訊號，
不可靜默放行。MUST 記錄來源 `ip` 與 `user-agent`。

**Request**（body，`refreshToken` 必填）：

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresIn": 900,
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshTokenExpiresIn": 604800
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`refreshToken` 缺漏
- `401`、`code: "INVALID_REFRESH_TOKEN"`：Token 無效、已過期，或已因 rotation / 登出進入黑名單

#### Scenario: 換發成功

- **WHEN** 送出有效且未進黑名單的 Refresh Token
- **THEN** 回 `200`，回傳的 `refreshToken` MUST 與送入的不同

#### Scenario: 舊 Token 重用被拒

- **WHEN** 以同一枚 Refresh Token 連續換發兩次
- **THEN** 第一次回 `200`，第二次 MUST 回 `401`、`code: "INVALID_REFRESH_TOKEN"`

#### Scenario: 登出後的 Token 不可換發

- **WHEN** 以登出時已加入黑名單的 Refresh Token 換發
- **THEN** 回 `401`、`code: "INVALID_REFRESH_TOKEN"`

### Requirement: 登出

`POST /api/admin/auth/logout` SHALL 將目前的 Access Token 加入黑名單；
body 若一併帶 `refreshToken`，該枚也 MUST 一併加入黑名單。
本 endpoint **需要有效 JWT**（未標記 `@Public()`）。

Access Token 由 `Authorization` header 取得，取值方式 MUST 與 `JwtAuthGuard` 一致
（確認 `Bearer ` 前綴後再取），否則會把整個 header 字串當成 Token 寫進黑名單，
造成實際的 Token 仍然有效。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（body 全部選填）：

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Access Token

#### Scenario: 登出後 Access Token 失效

- **WHEN** 登出成功後，以同一枚 Access Token 呼叫任一受保護 endpoint
- **THEN** 回 `401`

#### Scenario: 一併廢棄 Refresh Token

- **WHEN** 登出時 body 帶入 `refreshToken`
- **THEN** 回 `204`，該枚 Refresh Token 後續 MUST 無法用於換發

#### Scenario: 未帶 Token 登出

- **WHEN** 未帶 Authorization header
- **THEN** 回 `401`

### Requirement: 忘記密碼（防帳號列舉）

`POST /api/admin/auth/forgot-password` SHALL 寄送密碼重設信件。標記 `@Public()`。

**無論該 Email 是否存在，回應 MUST 完全相同**——同樣的 `204`、同樣沒有 body。
訊息文案由前端固定呈現，後端不回任何足以區分的內容。

MUST 套用嚴格節流：每來源每分鐘至多 3 次。這同時擋 SMTP 轟炸，
並壓低「存在與不存在的回應時間差」可被利用的次數。

**寄信 MUST NOT 阻塞回應**——MUST 以 fire-and-forget 執行，失敗只記錄於伺服器日誌。
狀態碼一致、回應無 body、email 不入日誌、節流都到位後，**剩下的訊號是時間差**：
`SMTP_HOST` 設定了卻連不上（憑證錯、防火牆、服務中斷）時會走滿 `connectionTimeout`
（預設 10 秒），使「帳號存在」的回應比「不存在」慢兩個數量級。這不需要統計方法就能
分辨，而節流只降低速率、不影響單次判定的可靠度。同一威脅在登入路徑上僅約 100ms
的差距就已用 dummy bcrypt 抹平；此處的差距大兩個量級。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（body，`email` 必填）：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`email` 缺漏或格式不合法
- `429`：超過每分鐘 3 次的節流上限

#### Scenario: 存在與不存在的回應相同

- **WHEN** 分別以存在與不存在的 Email 送出
- **THEN** 兩者 MUST 回相同的 `204` 且皆無 body

#### Scenario: 節流生效

- **WHEN** 同一來源一分鐘內送出第 4 次請求
- **THEN** 回 `429`

#### Scenario: SMTP 無回應時仍立即返回

- **WHEN** 寄信因連線逾時而長時間未完成
- **THEN** endpoint MUST 已回應 `204`，不等待寄送結果

#### Scenario: 寄送失敗不改變回應

- **WHEN** 寄信拋出例外
- **THEN** 回應仍為 `204`，錯誤僅記錄於伺服器日誌，MUST NOT 出現在回應中

### Requirement: 重設密碼

`POST /api/admin/auth/reset-password` SHALL 以密碼重設 Token 設定新密碼。
標記 `@Public()`。Token MUST 為**單次使用**，用過即失效，且過期後失效。
新密碼 MUST 通過 `PASSWORD_COMPLEXITY_LEVEL` 的檢核。
MUST 套用與忘記密碼相同的節流（每來源每分鐘 3 次）。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（body，兩欄皆必填）：

```json
{ "token": "abc123def456", "newPassword": "NewPassword123!" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`、`code: "BAD_REQUEST"`：Token 無效或已過期（`BadRequestException`），
  或 `newPassword` 未通過密碼複雜度檢核，或欄位缺漏
- `429`：超過節流上限

Token 無效與欄位驗證失敗**刻意共用 `400`**：重設連結是否有效不該由狀態碼區分，
否則就成了「這枚 Token 存不存在」的探測管道。

#### Scenario: 重設成功

- **WHEN** 以有效 Token 與合法新密碼送出
- **THEN** 回 `204`，該帳號可用新密碼登入

#### Scenario: Token 單次使用

- **WHEN** 以同一枚 Token 連續重設兩次
- **THEN** 第一次回 `204`，第二次 MUST 回 `400`、`code: "BAD_REQUEST"`

#### Scenario: 新密碼不符複雜度

- **WHEN** `newPassword` 未通過複雜度檢核
- **THEN** 回 `400`，密碼 MUST NOT 被變更

### Requirement: 個人資料查詢

`GET /api/admin/me` SHALL 回傳目前登入帳號的資料，含 `roleCode` 與
**該帳號實際擁有的 `permissionCodes`**，供前端做選單與操作按鈕的權限閘控。
持有有效 JWT 即可呼叫，MUST NOT 額外要求任何 permission——
否則會出現「登入成功卻拿不到自己是誰」的死結。

**Request**：無參數。

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
    "roleCode": "ADMIN",
    "status": true,
    "isDefault": false,
    "lastLoginAt": "2026-08-16T05:30:00.000Z",
    "createdAt": "2026-08-16T06:00:00.000Z",
    "updatedAt": "2026-08-16T06:00:00.000Z",
    "permissionCodes": ["BACKEND:ACCOUNT:VIEW", "BACKEND:ACCOUNT:EDIT"]
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Access Token

#### Scenario: 取得個人資料

- **WHEN** 任一已登入帳號打 `GET /api/admin/me`
- **THEN** 回 `200`，`data.permissionCodes` 為該帳號角色實際擁有的權限碼

#### Scenario: 無權限碼的帳號仍可取得

- **WHEN** 帳號的角色未指派任何權限
- **THEN** 回 `200`，`data.permissionCodes` 為空陣列，MUST NOT 回 403

#### Scenario: 未登入

- **WHEN** 未帶 Authorization header
- **THEN** 回 `401`
