## MODIFIED Requirements

### Requirement: 登入

`POST /api/admin/auth/login` SHALL 以 Email 與密碼換發 Access Token 與 Refresh Token。
標記 `@Public()`，成功回 `200`（非 201——沒有建立資源）。
MUST 記錄來源 `ip` 與 `user-agent` 供稽核與 IP 封鎖機制使用。

啟用 reCAPTCHA 功能開關時，body MUST 帶 `recaptchaToken` 並通過驗證。

登入失敗 MUST NOT 區分「帳號不存在」與「密碼錯誤」——兩者一律回相同的 `401` 與相同訊息，
否則回應本身就成為帳號列舉的管道。連續失敗達閾值時帳號 MUST 被鎖定。

**帳號鎖定 MUST 有時效**，時效長度來自 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`
（預設 15 分鐘），MUST NOT 寫死在程式碼中。

沒有時效的鎖定會產生一個**沒有復原路徑的死結**：鎖定的檢查排在密碼驗證之前，
所以被鎖的帳號連「密碼打對」都到不了清除計數的那條路；而人工解鎖的端點
需要一個已登入且具備 SUPERADMIN 的管理員。把已知的管理員 email 全部鎖一輪，
就沒有任何人能登入去解鎖——而觸發鎖定完全不需要認證，也不需要猜對密碼。

**鎖定到期時 MUST 一併清除失敗計數。** 失敗計數存在 Redis 且有自己的 TTL（30 分鐘），
比鎖定時效長。只判定到期而不清計數的話，使用者在到期後第一次打錯就會因為
「計數還在閾值上」而立刻重新被鎖，實際鎖定時間變成計數的 TTL 而非設定的時效——
而設定的那個數字看起來完全正常。

時效**不解決**「持續攻擊者可以持續重新鎖定」，那是 per-IP 限制的職責
（`APPLICATION_IP_BLOCK_THRESHOLD`，已存在）。時效解決的是「永久且無復原路徑」。

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
- `423`、`code: "ACCOUNT_LOCKED"`：帳號因連續登入失敗而鎖定，且尚未逾時效

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

- **WHEN** 帳號因連續登入失敗被鎖定，且距鎖定時間未超過
  `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`
- **THEN** 回 `423`、`code: "ACCOUNT_LOCKED"`，即使密碼正確

#### Scenario: 鎖定逾時效後自動解除

- **WHEN** 距鎖定時間已超過 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`，且密碼正確
- **THEN** 登入 MUST 成功，MUST NOT 需要任何人工介入

#### Scenario: 逾時效後的失敗計數已歸零

- **WHEN** 鎖定逾時效後，使用者再打錯一次密碼
- **THEN** MUST NOT 立刻重新鎖定——計數在到期時已清除，需重新累積到閾值

#### Scenario: 需先重設密碼

- **WHEN** 帳號被標記為必須重設密碼
- **THEN** 回 `403`、`code: "PASSWORD_CHANGE_REQUIRED"`
