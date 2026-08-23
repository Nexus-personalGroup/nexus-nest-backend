## ADDED Requirements

### Requirement: 前台註冊

`POST /api/front/auth/register` SHALL 建立一個**信箱尚未驗證**的前台使用者，
並寄出驗證信。無需認證（`@Public()`）。

密碼 MUST 以 bcrypt 雜湊儲存，`emailVerifiedAt` MUST 為 null，`status` MUST 為 true。

**本端點會揭露「這個信箱是否已註冊」（`409`），這是刻意的例外。**
不回 409 的話使用者收不到任何有用的回饋——他會以為註冊成功然後永遠等不到信。
而「這個信箱能不能註冊」本來就是註冊表單必須回答的問題，藏不住。
真正要擋的是**把它自動化**，那由節流負責（見「註冊與重發的節流」）。

**已註冊但尚未驗證的信箱再次註冊**：MUST 回 `409` 並**重發一次驗證信到原信箱**，
MUST NOT 覆蓋既有帳號的任何欄位（尤其是密碼）。這是使用者最常見的實際情境
（信被歸到垃圾信匣，於是他重新註冊一次），擋掉他等於逼他去用另一個信箱。
重發同樣受信箱節流約束。

寄信 MUST NOT 阻塞回應：SMTP 連不上時走滿逾時會讓註冊看起來當掉。
寄送失敗 MUST 寫入 log，MUST NOT 讓註冊本身失敗。

**Request**（body）：

```json
{
  "email": "user@example.com",
  "password": "User1234!",
  "displayName": "小明"
}
```

- `email` — MUST 為合法信箱格式，比對與儲存前 MUST 正規化（去空白、轉小寫）
- `password` — MUST 通過密碼政策
- `displayName` — 1–50 字

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": {
    "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
    "email": "user@example.com",
    "displayName": "小明",
    "emailVerified": false
  },
  "timestamp": "2026-08-24T06:00:00.000Z"
}
```

MUST NOT 回傳任何 token——註冊不等於登入，使用者要自己走登入流程。

**Failure Responses**：

- `400`：body 不符 schema，或密碼未通過政策
- `409`、`code: "EMAIL_ALREADY_EXISTS"`：該信箱已註冊
- `429`：命中 IP 或信箱節流

#### Scenario: 註冊成功

- **WHEN** 以未註冊的信箱送出合法的 body
- **THEN** 回 `201`，`users` 多一筆 `emailVerifiedAt` 為 null 的紀錄，
  且寄出一封含驗證連結的信

#### Scenario: 回應不含 token

- **WHEN** 註冊成功
- **THEN** 回應 MUST NOT 含 `accessToken` 或 `refreshToken`

#### Scenario: 信箱已註冊且已驗證

- **WHEN** 以已驗證的信箱註冊
- **THEN** 回 `409`、`code: "EMAIL_ALREADY_EXISTS"`，MUST NOT 寄信

#### Scenario: 信箱已註冊但未驗證

- **WHEN** 以已註冊、尚未驗證的信箱再次註冊
- **THEN** 回 `409`，**重發驗證信到原信箱**，
  且該帳號的密碼與 `displayName` MUST 維持不變

#### Scenario: 信箱大小寫不同

- **WHEN** 已存在 `foo@x.com`，以 `Foo@X.com` 註冊
- **THEN** 回 `409`——正規化之後是同一個信箱

#### Scenario: 密碼未通過政策

- **WHEN** 密碼過短或不符複雜度
- **THEN** 回 `400`，MUST NOT 建立任何紀錄

#### Scenario: 寄信失敗不影響註冊

- **WHEN** SMTP 不可用
- **THEN** 仍回 `201`，帳號已建立，失敗寫入 log

### Requirement: 信箱驗證

`GET /api/front/auth/verify-email?token=<token>` SHALL 驗證該 token 並把使用者
**302 導回前台**。無需認證。

導向目標為 `${APP_FRONT_URL}${APP_FRONT_VERIFY_REDIRECT_PATH}?result=<result>`，
`result` 為 `success` | `invalid` | `expired`。

**本端點是 GET 且帶副作用，這是刻意的**：信件裡只能放連結，而連結只有 GET。
代價是**預抓與郵件安全掃描會提前把 token 用掉**。緩解方式是
**驗證成功必須是冪等的**——已驗證的帳號再次帶同一個 token 進來，
MUST 導向 `result=success` 而不是 `invalid`。

token MUST 以 sha256 雜湊比對，MUST 同時比對 `purpose = VERIFY_EMAIL`——
拿密碼重設的 token 來驗證信箱 MUST 失敗。

驗證成功 MUST：設定 `emailVerifiedAt`、標記該 token 的 `usedAt`、
作廢該使用者其他未使用的 `VERIFY_EMAIL` token。

**無效、過期、purpose 不符** MUST 不可區分地導向失敗結果，
MUST NOT 在回應中透露帳號是否存在。

**Request**（query）：`token` — 明文 token

**Success Response** `302 Found`：無 body，`Location` 指向前台。

**Failure Responses**：同樣是 `302`，只是 `result` 不同。
本端點 MUST NOT 回傳 JSON 錯誤——使用者是從信件點進來的，
看到一段 JSON 只會不知道發生什麼事。

#### Scenario: 驗證成功

- **WHEN** 帶有效且未使用的 `VERIFY_EMAIL` token
- **THEN** `302` 導向 `?result=success`，該使用者的 `emailVerifiedAt` 不再是 null

#### Scenario: 重複點同一個連結

- **WHEN** 已驗證的使用者再次帶同一個 token 進來
- **THEN** 仍導向 `?result=success`——預抓與郵件掃描會提前消耗 token，
  對使用者顯示失敗是錯的

#### Scenario: token 過期

- **WHEN** token 的 `expiresAt` 已過
- **THEN** 導向 `?result=expired`，`emailVerifiedAt` 維持 null

#### Scenario: token 不存在

- **WHEN** 帶一個隨機字串
- **THEN** 導向 `?result=invalid`

#### Scenario: 拿密碼重設的 token 來驗證信箱

- **WHEN** token 存在但 `purpose` 是 `RESET_PASSWORD`
- **THEN** 導向 `?result=invalid`，MUST NOT 設定 `emailVerifiedAt`

#### Scenario: 驗證後其他驗證信失效

- **WHEN** 使用者先後收到兩封驗證信，用第二封驗證成功
- **THEN** 第一封的 token MUST 不再可用

### Requirement: 重發驗證信

`POST /api/front/auth/resend-verification` SHALL 對尚未驗證的帳號重發驗證信。
無需認證。

**無論信箱是否存在、是否已驗證，一律回 `204`。** 這一支與註冊不同：
註冊揭露信箱是否存在是為了給使用者有用的回饋，而重發沒有那個需求——
它若會依帳號狀態回不同的東西，就是一個乾淨的帳號探測點。

已驗證的帳號 MUST NOT 收到信（沒有意義），但回應仍是 `204`。

寄出的新 token MUST 作廢該使用者先前未使用的 `VERIFY_EMAIL` token。

**Request**（body）：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：body 不符 schema
- `429`：命中 IP 或信箱節流

#### Scenario: 未驗證的帳號

- **WHEN** 對已註冊但未驗證的信箱呼叫
- **THEN** 回 `204` 並寄出新的驗證信

#### Scenario: 信箱不存在

- **WHEN** 對從未註冊的信箱呼叫
- **THEN** 回 `204`，MUST NOT 寄信，回應與上一個情境**完全一致**

#### Scenario: 已驗證的帳號

- **WHEN** 對已驗證的信箱呼叫
- **THEN** 回 `204`，MUST NOT 寄信

#### Scenario: 舊的驗證信失效

- **WHEN** 連續重發兩次
- **THEN** 第一封的 token MUST 不再可用

### Requirement: 前台忘記密碼

`POST /api/front/auth/forgot-password` SHALL 產生 `RESET_PASSWORD` token 並寄出重設信。
無需認證。**無論信箱是否存在一律回 `204`**，判準與重發驗證信相同。

**未驗證的帳號也可以重設密碼**：忘記密碼與信箱驗證是兩件事，
而重設信本身就會送到那個信箱——能收到就證明他擁有它。

新 token MUST 作廢該使用者先前未使用的 `RESET_PASSWORD` token。

**Request**（body）：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：body 不符 schema
- `429`：命中 IP 或信箱節流

#### Scenario: 帳號存在

- **WHEN** 對已註冊的信箱呼叫
- **THEN** 回 `204` 並寄出重設信

#### Scenario: 信箱不存在

- **WHEN** 對從未註冊的信箱呼叫
- **THEN** 回 `204`，MUST NOT 寄信，回應與上一個情境**完全一致**

#### Scenario: 未驗證的帳號

- **WHEN** 對已註冊但未驗證信箱的帳號呼叫
- **THEN** 回 `204` 並照常寄出重設信

### Requirement: 前台重設密碼

`POST /api/front/auth/reset-password` SHALL 以 token 設定新密碼。無需認證。

MUST 同時比對 `purpose = RESET_PASSWORD`——拿驗證信的 token 來改密碼 MUST 失敗。

成功 MUST：寫入新密碼雜湊、**遞增 `tokenVersion`**（讓所有裝置立即登出——
會忘記密碼的情境本來就包含「帳號可能被別人用著」）、標記 token 的 `usedAt`、
作廢該使用者其他未使用的 `RESET_PASSWORD` token。

**無效、過期、已使用、purpose 不符**一律回同一個錯誤，MUST NOT 可區分。

**Request**（body）：

```json
{
  "token": "3f6c1b2a8d4e4a9fb1c72e5d9a0f7b31",
  "password": "NewPass1234!"
}
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`、`code: "INVALID_TOKEN"`：token 無效、過期、已使用或 purpose 不符
- `400`：新密碼未通過政策
- `429`：命中節流

#### Scenario: 重設成功

- **WHEN** 帶有效的 `RESET_PASSWORD` token 與合法新密碼
- **THEN** 回 `204`，可用新密碼登入，且**舊的 access token 立即失效**

#### Scenario: 舊密碼不再可用

- **WHEN** 重設成功後以舊密碼登入
- **THEN** 登入失敗

#### Scenario: token 重複使用

- **WHEN** 以同一個 token 再次重設
- **THEN** 回 `400`、`code: "INVALID_TOKEN"`

#### Scenario: 拿驗證信的 token 來改密碼

- **WHEN** token 存在但 `purpose` 是 `VERIFY_EMAIL`
- **THEN** 回 `400`、`code: "INVALID_TOKEN"`，密碼 MUST 不變

#### Scenario: 過期與無效不可區分

- **WHEN** 分別帶過期的 token 與不存在的 token
- **THEN** 兩者的狀態碼與 code MUST 完全相同

### Requirement: 未驗證信箱的存取限制

信箱尚未驗證的帳號 SHALL 可以登入、換發 token 與查看 `/api/front/me`，
但 SHALL NOT 使用任何聊天功能。

**擋下的範圍**：`/api/front/chat-*` 全部端點，以及 WebSocket 連線。
HTTP 回 `403`、`code: "EMAIL_NOT_VERIFIED"`；WS 於 handshake 拒絕並斷線。

**`/api/front/me` MUST 放行**：使用者要看得到自己的驗證狀態才知道卡在哪。
回應 MUST 帶 `emailVerified`。

擋的位置 MUST 集中在一個 Guard（`EmailVerifiedGuard`），
MUST NOT 散在各個 use case 裡——散開的話漏一支就是一個洞，
而那個洞不會有任何徵兆。**MUST 有一條守則**要求
`web/front/` 下掛了 `FrontJwtAuthGuard` 的 controller 也掛 `EmailVerifiedGuard`，
豁免需明列（目前只有 `FrontMeController`）。

#### Scenario: 未驗證可以登入

- **WHEN** 未驗證的帳號登入
- **THEN** 回 `200` 並拿到 token，回應中 `emailVerified` 為 false

#### Scenario: 未驗證看得到自己

- **WHEN** 未驗證的帳號打 `/api/front/me`
- **THEN** 回 `200`，帶 `emailVerified: false`

#### Scenario: 未驗證不能列出聊天室

- **WHEN** 未驗證的帳號打 `GET /api/front/chat-rooms`
- **THEN** 回 `403`、`code: "EMAIL_NOT_VERIFIED"`

#### Scenario: 未驗證不能檢舉

- **WHEN** 未驗證的帳號打 `POST /api/front/chat-reports`
- **THEN** 回 `403`、`code: "EMAIL_NOT_VERIFIED"`

#### Scenario: 驗證後立即可用

- **WHEN** 該帳號完成信箱驗證後，以**同一個** access token 再打一次聊天端點
- **THEN** 回 `200`——驗證狀態每次請求都重新解析，不快取在 token 裡

### Requirement: 註冊與重發的節流

本能力中**所有會寄信的端點**（註冊、重發驗證信、忘記密碼）
SHALL 同時受 **IP 節流**與**信箱節流**約束，命中時回 `429`。
各端點自身的請求與回應形狀寫在它們各自的需求裡，此處只規範這條橫向規則。

**兩層缺一不可**，因為它們擋的是不同的形狀：IP 節流擋「同一個來源大量註冊」，
但擋不住分散式來源；信箱節流擋「對同一個信箱反覆發信」，
而那是拿服務當垃圾信跳板的形狀，**它只需要一個 IP**。

信箱節流的計數鍵 MUST 是**正規化後的 email**（小寫、去空白），
否則 `Foo@x.com` 與 `foo@x.com` 會拿到兩份獨立的額度。

節流命中回 `429`，**不套用「一律 204」的規則**：節流是對呼叫者的資源限制，
與帳號是否存在無關，因此不洩漏任何東西。

#### Scenario: 同一信箱短時間重複重發

- **WHEN** 對同一個信箱在節流窗口內重複呼叫重發
- **THEN** 超出額度後回 `429`，且 MUST NOT 再寄出任何信

#### Scenario: 大小寫不同的同一信箱共用額度

- **WHEN** 交替以 `foo@x.com` 與 `FOO@X.com` 呼叫
- **THEN** 兩者 MUST 共用同一份額度

#### Scenario: 不同信箱不互相影響

- **WHEN** 某信箱已被節流，改用另一個未達額度的信箱
- **THEN** 該次請求 MUST NOT 因前者而被擋（除非命中 IP 節流）
