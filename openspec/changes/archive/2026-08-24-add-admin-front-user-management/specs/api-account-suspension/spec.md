## ADDED Requirements

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
