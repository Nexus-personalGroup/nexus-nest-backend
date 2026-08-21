# api-account-suspension Specification

## Purpose
審閱側的停權與解除契約。

**與帳號管理的 `PATCH /api/admin/members/:id { status: false }` 效果完全相同**
——兩者呼叫同一個 use case。刻意並存是因為角色不同：
「能管帳號的人」與「能做審閱處置的人」在真實團隊裡經常不是同一群
（客服能停權違規者，但不該改帳號的角色與密碼；HR 能停用離職員工，
但不該看檢舉內容）。差別只在授權來源與稽核紀錄的 action。

停權會做三件事：帳號停用、context 快取清除、**既有的 WebSocket 連線被斷開**。
第三項是關鍵——見 `platform-websocket-transport`。

停權與解除**都留稽核**：`members.status` 只留下「現在是什麼狀態」，
留不下「誰在什麼時候改的」，而反覆停權再解除本身就是可疑行為。

## Requirements
### Requirement: 從審閱側停權成員

`POST /api/admin/moderation/members/:memberId/suspend` SHALL 停用該成員的帳號，
需 `BACKEND:MODERATION:EDIT` 權限。

停權 MUST 產生與帳號管理側（`PATCH /api/admin/members/:id { status: false }`）
**完全相同的效果**：帳號停用、context 快取清除、既有的 WebSocket 連線被斷開。
兩個入口 MUST 呼叫同一個 use case，MUST NOT 各自實作。

**兩個入口刻意並存**：「能管帳號的人」與「能做審閱處置的人」是不同的角色。
客服能停權違規者，但不該能改帳號的角色與密碼；
HR 能停用離職員工，但不該能看檢舉內容。差別只在授權來源與稽核紀錄的 action。

**冪等**：對已停用的帳號再次停權回 `204`，不重複斷線也不重複稽核。

管理員 MUST NOT 停權自己——沿用帳號管理既有的保護。

**Request**（path）：`memberId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "MEMBER_NOT_FOUND"`：成員不存在
- `409`、`code: "SELF_DISABLE_FORBIDDEN"`：嘗試停權自己（沿用帳號管理既有的保護與狀態碼）

#### Scenario: 停權違規成員

- **WHEN** 有權限的管理員停權某成員
- **THEN** 回 `204`，該帳號停用、既有 WS 連線被斷開、留下稽核紀錄

#### Scenario: 已停用的帳號

- **WHEN** 對已停用的帳號再次停權
- **THEN** 回 `204`，MUST NOT 重複斷線或重複稽核

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者有 `BACKEND:MODERATION:VIEW` 但沒有 `EDIT`
- **THEN** 回 `403`

#### Scenario: 停權自己

- **WHEN** `memberId` 等於呼叫者自己
- **THEN** 回 `409`——沿用帳號管理既有的保護。狀態碼跟著既有實作走，
  不為了審閱側好看而改動既有端點的契約

### Requirement: 解除停權

`POST /api/admin/moderation/members/:memberId/reinstate` SHALL 恢復該成員的帳號，
需 `BACKEND:MODERATION:EDIT` 權限。

解除 MUST 留下稽核紀錄。停權與解除都是權力的行使，
而**反覆停權再解除本身就是可疑行為**——只有兩邊都記才看得出那個模式。

解除 MUST NOT 主動恢復任何連線或通知該成員：他的連線已經斷了、token 也失效了，
沒有任何管道可以推給他。使用者重新登入即可。

**冪等**：對未停用的帳號解除回 `204`，不重複稽核。

**Request**（path）：`memberId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "MEMBER_NOT_FOUND"`：成員不存在

#### Scenario: 解除停權

- **WHEN** 有權限的管理員解除某成員的停權
- **THEN** 回 `204`，帳號恢復、留下稽核紀錄

#### Scenario: 帳號本來就是啟用的

- **WHEN** 對未停用的帳號執行解除
- **THEN** 回 `204`，MUST NOT 重複稽核

#### Scenario: 解除不通知

- **WHEN** 解除完成
- **THEN** MUST NOT 推播任何事件——該成員沒有活著的連線可以收

