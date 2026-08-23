# api-account-suspension Specification

## Purpose
審閱側的停權與解除契約。**對象是前台使用者（`users`）。**

**與帳號管理的 `PATCH /api/admin/members/:id { status: false }` 停的是不同的東西**：
這裡停的是聊天的參與者，那裡停的是後台管理員。兩者因此是**兩個不同的 use case**，
而不是同一支加一個側別參數——後者會讓每個呼叫端都要記得傳對，
而傳錯的後果是停錯人且沒有任何錯誤訊息。

兩個入口並存也是因為角色不同：「能管帳號的人」與「能做審閱處置的人」
在真實團隊裡經常不是同一群（客服能停權違規者，但不該改後台帳號的角色與密碼；
HR 能停用離職員工，但不該看檢舉內容）。

停權會做四件事：帳號停用、`tokenVersion` 遞增（讓所有裝置立即失效）、
**既有的 WebSocket 連線被斷開**、寫入稽核。第三項是關鍵——
連線層的認證只在 handshake 執行一次，見 `platform-websocket-transport`。

停權與解除**都留稽核**：`users.status` 只留下「現在是什麼狀態」，
留不下「誰在什麼時候改的」，而反覆停權再解除本身就是可疑行為。
## Requirements
### Requirement: 從審閱側停權成員

`POST /api/admin/moderation/members/:memberId/suspend` SHALL 停用該**前台使用者**的帳號，
需 `BACKEND:MODERATION:EDIT` 權限。

**停權的對象是前台使用者（`users`），不是後台管理員（`members`）。**
審閱處理的是聊天裡的違規行為，而聊天的參與者是前台使用者——
停一個管理員的後台帳號對違規行為沒有任何作用。

**兩個入口停的是不同的東西，因此 MUST 是兩個不同的 use case**：

| 入口 | 對象 | use case |
| --- | --- | --- |
| `POST /moderation/members/:id/suspend` | 前台使用者 | `SUSPEND_FRONT_USER_USE_CASE` |
| `PATCH /members/:id { status: false }` | 後台管理員 | `UPDATE_MEMBER_USE_CASE`（既有） |

**MUST NOT 用「同一支 use case 加一個側別參數」實作。** 那會讓一支 use case
同時知道兩張表、兩種撤銷連線的方式、兩種稽核對象，而每個呼叫端都要記得傳對參數——
**傳錯的後果是停錯人，而那不會有任何錯誤訊息**。拆成兩支之後，
停權的對象由「呼叫哪一支」決定，型別上就不可能停錯。

停權 MUST 產生的效果：帳號停用、`tokenVersion` 遞增、既有的 WebSocket 連線被斷開、寫入稽核。
撤銷連線 MUST 對應正確的側別——前台使用者的連線與後台的是不同的身分空間。

**冪等**：對已停用的帳號再次停權回 `204`，不重複斷線也不重複稽核。

「不可停權自己」的保護 MUST NOT 適用於本端點：管理員與前台使用者是兩個不相交的
身分空間，管理員不可能是自己要停權的那個前台使用者。該保護仍然適用於帳號管理側。

**Request**（path）：`memberId`——前台使用者的 ID

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "MEMBER_NOT_FOUND"`：該前台使用者不存在
  （**包含傳入管理員 ID 的情況**——`409 SELF_DISABLE_FORBIDDEN` 不適用於本端點）

#### Scenario: 停權違規成員

- **WHEN** 具備 `BACKEND:MODERATION:EDIT` 的管理員停權某**前台使用者**
- **THEN** 回 `204`，該使用者的 `users.status` 為 false、`tokenVersion` 遞增、
  既有的 WS 連線被斷開、留下稽核紀錄

#### Scenario: 已停用的帳號

- **WHEN** 對已停權的使用者再次呼叫
- **THEN** 回 `204`，MUST NOT 重複斷線或重複稽核

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者只有 `BACKEND:MODERATION:VIEW`
- **THEN** 回 `403`

#### Scenario: 停權自己

- **WHEN** `memberId` 等於呼叫者自己的**管理員** ID
- **THEN** 回 `404`。管理員與前台使用者是兩個不相交的身分空間，
  管理員的 ID 在 `users` 裡查不到，所以它就只是一個不存在的 ID——
  `409 SELF_DISABLE_FORBIDDEN` 不適用於本端點。
  帳號管理側（`PATCH /members/:id`）的同名保護則仍然成立

#### Scenario: 傳入後台管理員的 ID

- **WHEN** `memberId` 是任何一個 `members` 的 ID（不存在於 `users`）
- **THEN** 回 `404`——兩個身分空間不相交，這個 ID 在這裡就是不存在

#### Scenario: 停權後既有的 WS 連線

- **WHEN** 該使用者停權時仍有開著的 WS 連線
- **THEN** 連線 MUST 被斷開——連線層的認證只在 handshake 執行一次，
  不主動斷開的話被停權者能繼續送訊息

### Requirement: 解除停權

`POST /api/admin/moderation/members/:memberId/reinstate` SHALL 解除該**前台使用者**的停權，
需 `BACKEND:MODERATION:EDIT` 權限。對象與 use case 的拆分規則同上。

解除 MUST 留下稽核紀錄——停權與解除都是權力的行使，
而**反覆停權再解除本身就是可疑的行為模式**，只有兩邊都記才看得出來。

解除停權 MUST NOT 自動恢復任何連線，也 MUST NOT 推播任何事件：
被停權者的連線早已斷開、token 也已失效，沒有任何管道推得到他。他重新登入即可。

**冪等**：對未停權的帳號呼叫回 `204`，不寫稽核（沒有狀態變化就沒有可記的事）。

**Request**（path）：`memberId`——前台使用者的 ID

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "MEMBER_NOT_FOUND"`：該前台使用者不存在

#### Scenario: 解除停權

- **WHEN** 對停權中的前台使用者呼叫
- **THEN** 回 `204`，`users.status` 為 true，並留下稽核紀錄

#### Scenario: 帳號本來就是啟用的

- **WHEN** 該使用者本來就是啟用狀態
- **THEN** 回 `204`，MUST NOT 寫稽核

#### Scenario: 解除不通知

- **WHEN** 解除完成
- **THEN** MUST NOT 推播任何事件——被停權者沒有活著的連線可以收

### Requirement: 從會員管理側停權

`POST /api/admin/front-users/:userId/suspend` SHALL 停用該前台使用者的帳號，
需 `BACKEND:FRONT_USER:EDIT` 權限。

**與審閱側的 `POST /moderation/members/:memberId/suspend` 呼叫同一個 use case**
（`SUSPEND_FRONT_USER_USE_CASE`），效果 MUST 完全相同：帳號停用、`tokenVersion` 遞增、
既有的 WebSocket 連線被斷開、寫入 `MEMBER_SUSPENDED` 稽核。

**兩個入口 MUST NOT 各自實作。** 分開的是**授權**而不是**行為**——
各自實作會讓斷線與稽核的行為分歧，而分歧的那一邊不會有人發現。
兩個入口並存的理由是角色不同：「能瀏覽客戶名單的客服」與「能看檢舉內容的審閱者」
在真實團隊裡經常不是同一群。

**稽核的 action 相同**（`MEMBER_SUSPENDED`），MUST NOT 為了區分入口而分裂它——
稽核記的是「發生了什麼」，不是「從哪個畫面按的」。真要區分來源時，
正確的做法是加一欄而不是拆 action 的語意。

**冪等**：對已停用的帳號再次停權回 `204`，不重複斷線也不重複稽核。

**Request**（path）：`userId` — 前台使用者 ID

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:FRONT_USER:EDIT`
- `404`、`code: "MEMBER_NOT_FOUND"`：該前台使用者不存在或已軟刪除

#### Scenario: 停權

- **WHEN** 具備 `BACKEND:FRONT_USER:EDIT` 的管理員呼叫
- **THEN** 回 `204`，`users.status` 為 false、`tokenVersion` 遞增、
  既有 WS 連線被斷開、留下 `MEMBER_SUSPENDED` 稽核

#### Scenario: 兩個入口的效果一致

- **WHEN** 分別從本端點與 `/moderation/members/:id/suspend` 停權兩個不同的使用者
- **THEN** 兩者在 `status`、`tokenVersion`、稽核 action 上 MUST 完全一致——
  差別只有稽核的執行者（各自的呼叫者）

#### Scenario: 只有審閱權限

- **WHEN** 呼叫者有 `BACKEND:MODERATION:EDIT` 但沒有 `BACKEND:FRONT_USER:EDIT`
- **THEN** 回 `403`——他該走審閱側的入口

#### Scenario: 已停用的帳號

- **WHEN** 對已停權的使用者再次呼叫
- **THEN** 回 `204`，MUST NOT 重複斷線或重複稽核

#### Scenario: 傳入後台管理員的 ID

- **WHEN** `userId` 是一個 `members` 的 ID
- **THEN** 回 `404`——兩個身分空間不相交

### Requirement: 從會員管理側解除停權

`POST /api/admin/front-users/:userId/reinstate` SHALL 解除該前台使用者的停權，
需 `BACKEND:FRONT_USER:EDIT` 權限。對象、use case 與稽核 action 的共用規則同上。

解除 MUST 留下 `MEMBER_REINSTATED` 稽核，MUST NOT 推播任何事件或恢復任何連線——
被停權者的連線早已斷開、token 也已失效，沒有任何管道推得到他。

**冪等**：對未停權的帳號呼叫回 `204`，不寫稽核。

**Request**（path）：`userId` — 前台使用者 ID

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:FRONT_USER:EDIT`
- `404`、`code: "MEMBER_NOT_FOUND"`：該前台使用者不存在或已軟刪除

#### Scenario: 解除停權

- **WHEN** 對停權中的前台使用者呼叫
- **THEN** 回 `204`，`users.status` 為 true，留下 `MEMBER_REINSTATED` 稽核

#### Scenario: 解除後可以重新登入

- **WHEN** 該使用者在解除後以原本的密碼登入
- **THEN** 登入成功——但**舊的 token 仍然無效**（停權時已遞增 `tokenVersion`）

#### Scenario: 帳號本來就是啟用的

- **WHEN** 該使用者本來就是啟用狀態
- **THEN** 回 `204`，MUST NOT 寫稽核

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者只有 `BACKEND:FRONT_USER:VIEW`
- **THEN** 回 `403`

