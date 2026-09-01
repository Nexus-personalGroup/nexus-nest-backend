## ADDED Requirements

### Requirement: 驗證信的連結必須指向後端

驗證信裡的連結 SHALL 以 `API_BASE_URL` 為 base 組成，
MUST NOT 使用 `APP_FRONT_URL`。

**兩個變數承擔的是兩個不同的角色，而它們長得很像**：

| 變數 | 角色 | 用在哪 |
| --- | --- | --- |
| `API_BASE_URL` | **後端自己的對外位址** | 信裡的連結（後端接） |
| `APP_FRONT_URL` | **前台網站的根位址** | 驗證完成後 302 的導回目標 |

`GET /api/front/auth/verify-email` 是後端路由，因此連結的 base MUST 是後端。
用前台的 origin 組出來的連結會指向**前台網站上不存在的路徑**——
而那個錯誤不會有任何徵兆：信寄出去了、狀態碼是對的、
只有點下去的人看到 404，而他沒有管道回報。

`API_BASE_URL` MUST 有預設值且在 production MUST 為必填
（與 `APP_FRONT_URL` 同一個理由：少了它連結就壞，而且壞得無聲）。

**本需求 MUST 由直接斷言連結字串的測試守住。** 打端點的測試驗不到它——
那類測試跑的是被測 app 自己的 base URL，而錯的正是 base 本身。
這是「送到系統外面去的字串」這一類的共同特徵：**它們在系統內部永遠不會被呼叫**。

#### Scenario: 連結的 origin

- **WHEN** 寄出一封驗證信
- **THEN** 信中連結 MUST 以 `API_BASE_URL` 開頭，
  MUST NOT 以 `APP_FRONT_URL` 開頭

#### Scenario: 兩個變數設成不同值

- **WHEN** `API_BASE_URL` 與 `APP_FRONT_URL` 指向不同的 origin
- **THEN** 連結 MUST 用前者，302 的導回目標 MUST 用後者

#### Scenario: base 結尾有斜線

- **WHEN** `API_BASE_URL` 設為 `http://localhost:3000/`
- **THEN** 組出來的連結 MUST NOT 出現連續兩個斜線

#### Scenario: production 未設定

- **WHEN** `NODE_ENV=production` 且未設 `API_BASE_URL`
- **THEN** 啟動 MUST 失敗並指出缺少該變數，MUST NOT 以預設值靜默啟動

### Requirement: 認證端點必須有端點層節流

前台 auth 的每一支端點 SHALL 各自宣告端點層節流，
MUST NOT 只依賴全域的預設節流。

全域節流的量級是為一般 API 設計的（預設 100 次／分鐘／IP）。
對登入而言那是每天十四萬次密碼嘗試，比登入端點該有的水位高了約三個數量級；
對註冊而言那是每分鐘一百個帳號。

**「有全域節流」不等於「這支端點被保護了」**——兩者的差別不會在任何測試裡出現，
只會在被利用的時候出現。

節流命中回 `429`。端點層的額度 MUST 明顯小於全域預設，
登入類與寄信類 SHALL 落在每分鐘個位數的量級。

#### Scenario: 登入連續失敗

- **WHEN** 同一 IP 在一分鐘內對登入端點送出超過額度的請求
- **THEN** 超出的請求 MUST 回 `429`，MUST NOT 進到密碼比對

#### Scenario: 註冊連續請求

- **WHEN** 同一 IP 在一分鐘內對註冊端點送出超過額度的請求
- **THEN** 超出的請求 MUST 回 `429`，MUST NOT 建立帳號也 MUST NOT 寄信

#### Scenario: 額度與全域預設的關係

- **WHEN** 檢視任一前台 auth 端點的節流設定
- **THEN** 其額度 MUST 小於全域預設——等於或大於全域等於沒有設

#### Scenario: 未宣告節流的端點

- **WHEN** 新增一支前台 auth 端點但未宣告端點層節流
- **THEN** 違反本需求

## MODIFIED Requirements

### Requirement: 前台登入

`POST /api/front/auth/login` SHALL 以 Email 與密碼換發前台的 Access Token 與 Refresh Token。
標記 `@Public()`，成功回 `200`（非 201——沒有建立資源）。

簽發 MUST 使用**前台專屬的 secret**（`FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`），
payload MUST 帶 `side: 'front'`。

登入失敗 MUST NOT 區分「帳號不存在」與「密碼錯誤」——兩者一律回相同的 `401` 與相同訊息。
帳號不存在時 MUST 仍執行一次 bcrypt 比對，抹平與「帳號存在但密碼錯」的回應時間差；
用於比對的 dummy hash 的 cost MUST 與 `BCRYPT_ROUNDS` 相同，否則時間差依然存在。

**MUST NOT 實作帳號鎖定。** per-account 的鎖定是一個未認證者可以觸發的 DoS 面
（後台那套已為此加上時效）。前台的暴力破解防護改由 per-IP 的兩層負責：

1. **端點層節流**（見「認證端點必須有端點層節流」）
2. **IP 失敗計數**：登入失敗 MUST 遞增該 IP 的失敗計數，
   達到 `APPLICATION_IP_BLOCK_THRESHOLD` MUST 自動加入 IP 黑名單

第 2 點 MUST 真的接上，MUST NOT 只寫在註解裡。
**描述了一條不存在防線的註解，比沒有註解更危險**——它會讓下一個讀的人
以為事情已經做完了，於是那個缺口永遠不會被補。

登入成功 MUST 更新 `lastSeenAt`，並 MUST 重置該 IP 的失敗計數。

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
- `429`：命中端點層節流，或該 IP 已在黑名單

#### Scenario: 登入成功

- **WHEN** 送出正確的 Email 與密碼且帳號啟用中
- **THEN** 回 `200`，`data` 含兩枚 Token 與 `user` 摘要，且 `lastSeenAt` 被更新，
  該 IP 的失敗計數歸零

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

#### Scenario: ⭐ 登入失敗遞增 IP 失敗計數

- **WHEN** 某 IP 登入失敗
- **THEN** 該 IP 的失敗計數 MUST 遞增——MUST NOT 只有全域節流在擋

#### Scenario: ⭐ 達到門檻自動封鎖

- **WHEN** 某 IP 的登入失敗次數達到 `APPLICATION_IP_BLOCK_THRESHOLD`
- **THEN** 該 IP MUST 被加入黑名單，後續請求 MUST 被擋下

#### Scenario: 未驗證信箱仍可登入

- **WHEN** 以尚未驗證信箱的帳號登入
- **THEN** 登入 MUST 成功——驗證是聊天的門檻，不是登入的門檻

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

**併發註冊同一信箱 MUST 回 `409`，MUST NOT 回 `500`。**
「先查再建」之間有一個窗口，兩個同時進來的請求會都通過查詢。
資料庫的唯一索引是最終仲裁者，因此**唯一索引衝突 MUST 被視為正常結果而非錯誤**
——先查只是為了給出更好的訊息與順便重發驗證信，不是為了防止衝突。

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
- `409`、`code: "EMAIL_ALREADY_EXISTS"`：該信箱已註冊（含併發撞上唯一索引）
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

#### Scenario: ⭐ 併發註冊同一信箱

- **WHEN** 兩個請求同時以同一個未註冊的信箱送出
- **THEN** 一個回 `201`，另一個回 `409`、`code: "EMAIL_ALREADY_EXISTS"`
  ——MUST NOT 有任何一個回 `500`

#### Scenario: 信箱大小寫不同

- **WHEN** 已存在 `foo@x.com`，以 `Foo@X.com` 註冊
- **THEN** 回 `409`——正規化之後是同一個信箱

#### Scenario: 密碼未通過政策

- **WHEN** 密碼過短或不符複雜度
- **THEN** 回 `400`，MUST NOT 建立任何紀錄

#### Scenario: 寄信失敗不影響註冊

- **WHEN** SMTP 不可用
- **THEN** 仍回 `201`，帳號已建立，失敗寫入 log

### Requirement: 前台重設密碼

`POST /api/front/auth/reset-password` SHALL 以 token 設定新密碼。無需認證。

MUST 同時比對 `purpose = RESET_PASSWORD`——拿驗證信的 token 來改密碼 MUST 失敗。

成功 MUST：寫入新密碼雜湊、**遞增 `tokenVersion`**（讓所有裝置立即登出——
會忘記密碼的情境本來就包含「帳號可能被別人用著」）、標記 token 的 `usedAt`、
作廢該使用者其他未使用的 `RESET_PASSWORD` token。

**成功 MUST 一併標記信箱已驗證。** 重設信送到該信箱，**能收到就證明他擁有它**
——那與驗證信要證明的是**同一件事**，用的是同一個信箱、同一組 sha256 雜湊儲存的
一次性 token、同一套作廢邏輯。憑證的強度並不比驗證信弱。

不標記的話會產生一個使用者自己解不開的死結：密碼改好了、能登入了，
但聊天仍然被擋、WS 連線直接被拒，而他手上沒有任何線索指向
「你還要去點另一封信」——**而那封信可能就是當初沒收到才走到忘記密碼的**。

標記 MUST 是條件式的（僅在尚未驗證時寫入），重複呼叫 MUST 安全。

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

#### Scenario: ⭐ 未驗證的帳號重設密碼後可以聊天

- **WHEN** 尚未驗證信箱的使用者走完重設密碼流程
- **THEN** `emailVerifiedAt` MUST 不再是 null，該使用者 MUST 能通過信箱驗證的門檻

#### Scenario: 已驗證的帳號重設密碼

- **WHEN** 已驗證的使用者重設密碼
- **THEN** 回 `204`，`emailVerifiedAt` MUST 維持原值（不被覆寫成新的時間）

#### Scenario: 舊密碼不再可用

- **WHEN** 重設成功後以舊密碼登入
- **THEN** 登入失敗

#### Scenario: token 重複使用

- **WHEN** 以同一個 token 再次重設
- **THEN** 回 `400`、`code: "INVALID_TOKEN"`

#### Scenario: 拿驗證信的 token 來改密碼

- **WHEN** token 存在但 `purpose` 是 `VERIFY_EMAIL`
- **THEN** 回 `400`、`code: "INVALID_TOKEN"`，密碼 MUST 不變，
  且 `emailVerifiedAt` MUST 不變

#### Scenario: 過期與無效不可區分

- **WHEN** 分別帶過期的 token 與不存在的 token
- **THEN** 兩者的狀態碼與 code MUST 完全相同
