# api-user-management Specification

## Purpose

定義後台管理**前台使用者**的 endpoint 契約（`/api/admin/front-users/*`）：
列表、帳號面詳情、強制登出。停權與解除的契約在 `api-account-suspension`。

**能力名稱不叫 `api-front-user-*`**：`api-front-` 這個前綴被保留給**前台自己的**
端點（`api-front-auth`、`api-front-chat-*`），而這幾支是後台端點。
路徑仍然是 `/admin/front-users`——後台的 namespace 裡單看 `users` 分不出
是「後台使用者」還是「前台使用者」，而讀日誌的人沒有上下文可以推斷。

存在的理由是一個**進入點的缺口**：`migrate-chat-to-front-users` 把聊天的身分
切到 `users` 之後，後台唯一能碰到前台使用者的路徑是檢舉——
找不到沒被檢舉過的人、不能主動停權。

三個貫穿全篇的決定：

- **權限碼是第三組**（`BACKEND:FRONT_USER:VIEW` / `EDIT`），與後台帳號管理
  （`ACCOUNT`）、檢舉審閱（`MODERATION`）都不相通。三者管的是三件不同的事：
  後台同事的帳號、檢舉的內容、客戶的名單。
- **不提供任何編輯與刪除**。改 displayName / avatarUrl 是代替使用者改他自己的資料；
  刪帳號則會讓聊天資料的當事人變成查不到的 ID（沒有外鍵），那個語意要先決定。
- **強制登出不是停權**。前者不動 `status`，語意是「這個帳號可能外洩」；
  用停權代替會在稽核裡留下一筆不實的違規紀錄。

前端畫面行為見 `ui-user-management`。
## Requirements
### Requirement: 前台使用者列表查詢

`GET /api/admin/front-users` SHALL 以分頁回傳**前台使用者**（`users`）清單，
支援 email 與顯示名稱的模糊搜尋、啟用狀態過濾、信箱驗證狀態過濾，
多個條件同時給定時 MUST 取交集。MUST 要求 JWT Bearer Token 與
`BACKEND:FRONT_USER:VIEW` 權限。

軟刪除（`deletedAt != null`）的帳號 MUST NOT 出現，與 `status` 參數無關。

**回傳的對象是 `users`，MUST NOT 包含任何 `members` 的資料。** 兩者是不相交的
身分空間；查錯表的症狀是一份看起來完全正常、只是列了另一群人的清單。

排序固定為 `createdAt DESC`，MUST NOT 開放自訂排序——可排序的欄位一旦開放
就要為每一個建索引，而目前沒有任何排序需求。

**MUST NOT 回傳 `password`。** 這是唯一一個必須從 select 明確排除的欄位。

**Request**（query）：

- `page?: integer` — 頁碼，預設 1，最小 1
- `limit?: integer` — 每頁筆數，上限 200，未指定時取環境變數 `DEFAULT_PAGE_LIMIT`
- `email?: string` — email 模糊搜尋
- `displayName?: string` — 顯示名稱模糊搜尋
- `status?: boolean` — 啟用狀態過濾。以 zod `z.enum(['true', 'false'])` 嚴格解析，
  **省略即不過濾**，非 `'true' | 'false'` 的值 MUST 回 400
- `verified?: boolean` — 信箱驗證狀態過濾。`true` 對應 `emailVerifiedAt != null`，
  `false` 對應 `emailVerifiedAt = null`。解析方式與省略語意同 `status`

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
        "email": "user1@example.com",
        "displayName": "小明",
        "avatarUrl": null,
        "status": true,
        "emailVerifiedAt": "2026-08-20T03:12:00.000Z",
        "lastSeenAt": "2026-08-23T01:40:00.000Z",
        "createdAt": "2026-08-18T09:00:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
  },
  "timestamp": "2026-08-23T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:FRONT_USER:VIEW`
- `400`：query 參數不符 schema（例如 `status=yes`）

#### Scenario: 分頁列出

- **WHEN** 具備 `BACKEND:FRONT_USER:VIEW` 的管理員不帶任何過濾條件呼叫
- **THEN** 回 `200`，`list` 依 `createdAt` 由新到舊，`meta` 帶正確的 `total` 與 `totalPages`

#### Scenario: 只有檢舉審閱權限

- **WHEN** 呼叫者有 `BACKEND:MODERATION:VIEW` 但沒有 `BACKEND:FRONT_USER:VIEW`
- **THEN** 回 `403`——能看檢舉不等於能瀏覽全部客戶名單

#### Scenario: 只有後台帳號管理權限

- **WHEN** 呼叫者有 `BACKEND:ACCOUNT:VIEW` 但沒有 `BACKEND:FRONT_USER:VIEW`
- **THEN** 回 `403`——後台帳號與前台使用者是兩個身分空間，授權也是

#### Scenario: 清單裡沒有後台管理員

- **WHEN** 資料庫同時有 `members` 與 `users` 的資料
- **THEN** 回傳的清單 MUST 只含 `users`；`members` 的任何一筆都不得出現

#### Scenario: 未驗證信箱過濾

- **WHEN** 帶 `verified=false`
- **THEN** 只回 `emailVerifiedAt` 為 null 的帳號

#### Scenario: 搜尋條件取交集

- **WHEN** 同時帶 `email` 與 `status=false`
- **THEN** 只回同時符合兩者的帳號

#### Scenario: 已軟刪除的帳號

- **WHEN** 某帳號的 `deletedAt` 不為 null
- **THEN** 無論 `status` 帶什麼，它都 MUST NOT 出現在清單中

#### Scenario: 回應不含密碼雜湊

- **WHEN** 任何一次列表查詢成功
- **THEN** 回應 MUST NOT 含 `password` 欄位

### Requirement: 前台使用者詳情

`GET /api/admin/front-users/:userId` SHALL 回傳單一前台使用者的**帳號面**資料，
需 `BACKEND:FRONT_USER:VIEW` 權限。回傳的欄位與列表相同。

**MUST NOT 回傳 `updatedAt`。** 本能力不提供任何編輯前台使用者的功能，
而系統內唯一會動到 `updated_at` 的是登入時的 `lastSeenAt`——兩者幾乎永遠相同，
多一欄只是多一個會被誤讀的數字。

**與 `GET /api/admin/moderation/members/:memberId` 是兩支不同的端點，各自回答不同的問題**：
本端點回答「這個帳號是什麼狀態」，審閱側的成員概覽回答「這個人在聊天裡做了什麼」。
兩者 MUST NOT 合併——審閱側刻意只回八個欄位且不含帳號資料，把帳號面補進去
等於自己拆掉那條權限邊界。

`lastSeenAt` 的語意是**最後一次登入或換發 token 的時間**，不是「最後上線」。
呼叫端在顯示時 MUST 標示清楚，否則它會被讀成後者。

軟刪除的帳號 MUST 回 `404`。

**Request**（path）：`userId` — 前台使用者 ID（UUID）

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
    "email": "user1@example.com",
    "displayName": "小明",
    "avatarUrl": null,
    "status": true,
    "emailVerifiedAt": "2026-08-20T03:12:00.000Z",
    "lastSeenAt": "2026-08-23T01:40:00.000Z",
    "createdAt": "2026-08-18T09:00:00.000Z"
  },
  "timestamp": "2026-08-23T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:FRONT_USER:VIEW`
- `404`、`code: "MEMBER_NOT_FOUND"`：該前台使用者不存在或已軟刪除
  （**包含傳入後台管理員 ID 的情況**——兩個身分空間不相交）

#### Scenario: 取得詳情

- **WHEN** 具備權限的管理員以存在的 `userId` 呼叫
- **THEN** 回 `200`，帶八個帳號面欄位，MUST NOT 含 `password` 或 `updatedAt`

#### Scenario: 傳入後台管理員的 ID

- **WHEN** `userId` 是一個 `members` 的 ID
- **THEN** 回 `404`——那個 ID 在 `users` 裡不存在

#### Scenario: 已軟刪除的帳號

- **WHEN** 該帳號的 `deletedAt` 不為 null
- **THEN** 回 `404`

#### Scenario: 沒有權限

- **WHEN** 呼叫者缺 `BACKEND:FRONT_USER:VIEW`
- **THEN** 回 `403`

### Requirement: 強制登出前台使用者

`POST /api/admin/front-users/:userId/force-logout` SHALL 讓該使用者所有裝置的
token 立即失效並斷開其既有的 WebSocket 連線，**但 MUST NOT 改變帳號的 `status`**。
需 `BACKEND:FRONT_USER:EDIT` 權限。

**這與停權是兩件不同的事，MUST NOT 用「停權再解除」代替**：

| 動作 | 語意 | `status` | 使用者能否重新登入 |
| --- | --- | --- | --- |
| 停權 | 這個人違規 | 變 false | 不能 |
| 強制登出 | 這個帳號可能被別人拿到了 | 不變 | 能 |

用停權代替會在稽核裡留下一筆**不實的違規紀錄**，而稽核的用途正是事後回答
「這個人被怎麼對待過」。

實作 MUST：遞增 `tokenVersion`（唯一能讓既有 access token 立即失效的機制）、
撤銷既有的 WebSocket 連線、寫入 `MEMBER_FORCE_LOGGED_OUT` 稽核
（`memberId` 為執行的管理員，`targetMemberId` 為該使用者）。

**對已停權的帳號同樣有效**：兩件事互相獨立，沒有理由讓其中一個擋住另一個。

**不冪等，且刻意如此**：每次呼叫都遞增 `tokenVersion` 並寫一筆稽核。
「再登出一次」是一個有意義的重複動作（第一次之後對方又登入了），
把它做成冪等會讓第二次靜默無效。

**Request**（path）：`userId` — 前台使用者 ID

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:FRONT_USER:EDIT`
- `404`、`code: "MEMBER_NOT_FOUND"`：該前台使用者不存在或已軟刪除

#### Scenario: 強制登出

- **WHEN** 具備 `BACKEND:FRONT_USER:EDIT` 的管理員呼叫
- **THEN** 回 `204`，該使用者的 `tokenVersion` 遞增、既有 WS 連線被斷開、
  留下 `MEMBER_FORCE_LOGGED_OUT` 稽核，且 `status` **不變**

#### Scenario: 舊 token 立即失效

- **WHEN** 該使用者持強制登出前簽發的 access token 打前台端點
- **THEN** 回 `401`——`tokenVersion` 已經對不上

#### Scenario: 重新登入即可繼續使用

- **WHEN** 該使用者在強制登出後重新登入
- **THEN** 登入成功——帳號沒有被停用

#### Scenario: 對已停權的帳號強制登出

- **WHEN** 該帳號的 `status` 已經是 false
- **THEN** 仍回 `204`，`tokenVersion` 照常遞增，`status` 維持 false

#### Scenario: 連續兩次強制登出

- **WHEN** 對同一個帳號連續呼叫兩次
- **THEN** 兩次都回 `204`，`tokenVersion` 共遞增 2，稽核共兩筆

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者只有 `BACKEND:FRONT_USER:VIEW`
- **THEN** 回 `403`，該使用者的 `tokenVersion` 不變

#### Scenario: 使用者不存在

- **WHEN** `userId` 不存在於 `users`
- **THEN** 回 `404`、`code: "MEMBER_NOT_FOUND"`

### Requirement: 前台使用者的模糊搜尋必須用得到索引

前台使用者列表（`GET /api/admin/front-users`）的 `email` 與 `displayName`
模糊搜尋 SHALL 由資料庫索引支援，MUST NOT 退化為全表掃描。

**本需求不是 endpoint 契約**——請求與回應形狀、搜尋語意都由
「前台使用者列表查詢」定義且不受本需求影響，這裡約束的只是它怎麼被執行。

兩個欄位都以不分大小寫的子字串比對（Prisma 的 `contains` +
`mode: 'insensitive'`，翻成 `ILIKE '%x%'`）。**B-tree 索引對前後都有萬用字元的
樣式無效**——`email` 雖有 unique 索引也用不上，`displayName` 則根本沒有索引。

實作 MUST 使用 `pg_trgm` 的 GIN 索引：它加速 `ILIKE '%x%'` 而
**完全不改變比對語意**。MUST NOT 為了效能把搜尋改成前綴比對——
那會改變行為（使用者輸入 `@gmail.com` 就再也找不到人），
屬於產品決定而非效能調整。

索引 MUST 宣告於 `schema.prisma`，MUST NOT 只寫在 migration SQL 裡：
Prisma 比對 schema 與 migration 產生的 shadow DB 時會看到「DB 有、schema 沒有」
的索引，**下一次 `migrate dev` 會產生一支把它刪掉的 migration**。
extension 本身（`CREATE EXTENSION`）則相反——未啟用 `postgresqlExtensions`
preview 時 Prisma 不追蹤 extension，寫在 migration 裡不會造成 drift。

**一個已知限制 MUST 記錄在案**：`pg_trgm` 以三字元為單位建索引，
**搜尋字串少於 3 個字元時索引用不上**，仍會退回全表掃描。
不寫下來的話，下一個量到「搜兩個字還是很慢」的人會以為索引沒建成功。

#### Scenario: ⭐ 以 email 片段搜尋

- **WHEN** 管理員以 `email=gmail` 查詢
- **THEN** 查詢 MUST 使用 GIN 索引，且結果與加索引前**完全相同**

#### Scenario: ⭐ 搜尋語意不得改變

- **WHEN** 管理員以 `email=@gmail.com` 查詢（樣式出現在字串中段或尾端）
- **THEN** MUST 仍然比對得到——實作 MUST NOT 改為前綴比對

#### Scenario: 少於三字元的搜尋

- **WHEN** 搜尋字串只有 1–2 個字元
- **THEN** 結果仍 MUST 正確；效能退回全表掃描是已知且被接受的

