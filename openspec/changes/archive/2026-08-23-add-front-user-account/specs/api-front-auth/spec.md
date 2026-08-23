## ADDED Requirements

### Requirement: 前台登入

`POST /api/front/auth/login` SHALL 以 Email 與密碼換發前台的 Access Token 與 Refresh Token。
標記 `@Public()`，成功回 `200`（非 201——沒有建立資源）。

簽發 MUST 使用**前台專屬的 secret**（`FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`），
payload MUST 帶 `side: 'front'`。

登入失敗 MUST NOT 區分「帳號不存在」與「密碼錯誤」——兩者一律回相同的 `401` 與相同訊息。
帳號不存在時 MUST 仍執行一次 bcrypt 比對，抹平與「帳號存在但密碼錯」的回應時間差；
用於比對的 dummy hash 的 cost MUST 與 `BCRYPT_ROUNDS` 相同，否則時間差依然存在。

**MUST NOT 實作帳號鎖定。** 前台的暴力破解防護由全域 throttle 與
`APPLICATION_IP_BLOCK_THRESHOLD` 負責——那是 per-IP 而非 per-account 的層級。
per-account 的鎖定是一個未認證者可以觸發的 DoS 面（後台那套已為此加上時效）。

登入成功 MUST 更新 `lastSeenAt`。

**Request**（body，`email` / `password` 必填）：

```json
{
  "email": "user@example.com",
  "password": "mypassword123"
}
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresIn": 7200,
    "refreshTokenExpiresIn": 604800,
    "user": {
      "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
      "email": "user@example.com",
      "displayName": "小明",
      "avatarUrl": null
    }
  },
  "timestamp": "2026-08-23T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`email` 格式不合法或 `password` 缺漏
- `401`、`code: "UNAUTHORIZED"`：帳號不存在**或**密碼錯誤（兩者訊息一致）
- `403`、`code: "ACCOUNT_DISABLED"`：帳號 `status` 為 `false`

#### Scenario: 登入成功

- **WHEN** 送出正確的 Email 與密碼且帳號啟用中
- **THEN** 回 `200`，`data` 含兩枚 Token 與 `user` 摘要，且 `lastSeenAt` 被更新

#### Scenario: 密碼錯誤與帳號不存在不可區分

- **WHEN** 分別以「不存在的 Email」與「存在但密碼錯誤」送出
- **THEN** 兩者 MUST 回相同的 `401` 與相同 `message`

#### Scenario: 帳號停權

- **WHEN** 帳號 `status` 為 `false` 且密碼正確
- **THEN** 回 `403`、`code: "ACCOUNT_DISABLED"`

#### Scenario: 簽出的 token 帶側別

- **WHEN** 登入成功
- **THEN** 兩枚 token 的 payload MUST 含 `side: 'front'`，且 MUST 以前台 secret 簽發

#### Scenario: 連續失敗不鎖定帳號

- **WHEN** 同一個帳號連續多次密碼錯誤
- **THEN** 帳號 MUST NOT 被鎖定——防護由 IP 層級的機制負責

### Requirement: 前台 Token 更新

`POST /api/front/auth/refresh` SHALL 以 Refresh Token 換發新的一對 Token（rotation）。
標記 `@Public()`。

驗證 MUST 使用前台的 refresh secret，且 MUST 檢查 payload 的
`type === 'refresh'` 與 `side === 'front'`。以 access token 呼叫本端點 MUST 回 `401`。

換發時 MUST 比對 `tokenVersion`：與 `users.tokenVersion` 不符即視為已撤銷。

**Request**（body）：`refreshToken` 必填

**Success Response** `200 OK`：形狀與登入相同（含新的 `accessToken` / `refreshToken`）

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：token 無效、過期、型別錯誤、側別錯誤或版本已撤銷
- `403`、`code: "ACCOUNT_DISABLED"`：帳號在這期間被停權

#### Scenario: 以 access token 呼叫

- **WHEN** body 帶的是 access token
- **THEN** 回 `401`——`type` 不符

#### Scenario: 以後台的 refresh token 呼叫

- **WHEN** body 帶的是 `/api/admin/auth/login` 簽出的 refresh token
- **THEN** 回 `401`——**用不同的 secret 簽的，簽章就驗不過**

#### Scenario: 帳號的 tokenVersion 已遞增

- **WHEN** 該帳號在 token 簽發後執行過強制登出
- **THEN** 回 `401`

### Requirement: 前台登出

`POST /api/front/auth/logout` SHALL 把當前的 access token 加入黑名單，回 `204`。

黑名單 MUST 沿用既有的實作——它以 token 本身為鍵，與哪一側簽發無關。
這是少數應該共用的機制：它處理的是 token 這個載體，而不是 token 背後的身分。

#### Scenario: 登出後以同一枚 token 呼叫受保護端點

- **WHEN** 登出後再用同一枚 access token
- **THEN** 回 `401`

#### Scenario: 未帶 token 呼叫登出

- **WHEN** 沒有 `Authorization` header
- **THEN** 回 `401`

### Requirement: 前台個人資料

`GET /api/front/me` SHALL 回傳目前登入的前台使用者。

回應 MUST NOT 包含 `password`、`tokenVersion` 或任何後台概念
（角色、權限碼）——前台使用者沒有那些東西。

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
    "email": "user@example.com",
    "displayName": "小明",
    "avatarUrl": null,
    "emailVerifiedAt": null,
    "createdAt": "2026-08-01T06:00:00.000Z"
  },
  "timestamp": "2026-08-23T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token

#### Scenario: 以前台 token 查詢

- **WHEN** 帶有效的前台 access token
- **THEN** 回傳該使用者的公開欄位

#### Scenario: 以後台 token 查詢

- **WHEN** 帶 `/api/admin/auth/login` 簽出的 token
- **THEN** 回 `401`——前台 secret 驗不過後台簽的 token

#### Scenario: 回應不含敏感或後台欄位

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應 MUST NOT 出現 `password`、`tokenVersion`、角色或權限碼
