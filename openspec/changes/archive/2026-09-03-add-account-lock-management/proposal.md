## Why

**現在沒有任何方式看到誰的帳號被鎖了。** 鎖定是登入失敗達門檻
（`APPLICATION_ACCOUNT_LOCK_THRESHOLD`，預設 3 次）後自動發生的，
而管理員只有在使用者主動來反應時才知道。解鎖端點
（`POST /admin/security/unlock-account`）早就存在，但它要求管理員
**先知道是誰、而且知道對方的 email**——那正是缺口所在。

這條在 `tasks/todo.md` 的「延後功能」躺著，延後理由是「優先度低於 M2–M4」。
**M2–M4 都完成了，那個理由已經失效**，而它是待辦裡唯一沒有外部相依、
可以直接動的功能。

## What Changes

- **新增 `GET /api/admin/security/locks`**：分頁列出被鎖定的後台帳號，
  支援 email 模糊搜尋與狀態過濾。沿用 security 模組既有的
  `RolesGuard + @Roles(SUPERADMIN)`。
- **新增前端 `/security/account-locks` 列表頁**，掛在 Sidebar 的「安全管理」群組。
- **解鎖直接呼叫既有的 `POST unlock-account`**，不新增解鎖端點。

**不做**（範圍比 todo 記載的小，理由見 design D1 / D2）：

- **不新增 `DELETE /locks/:id`**——它與既有的 `POST unlock-account` 做同一件事，
  只是吃 id 而非 email，而列表頁本來就拿得到 email。**零個新的解鎖端點。**
- **不新增 `POST /locks`（手動鎖定）**——後台已有停用帳號（`status=false`）。
  手動鎖定的語意是「過 N 分鐘會自己解開」，那對「我要擋住這個人」的意圖是錯的。
  鎖定是登入失敗的自動化產物，不是管理動作。

## Capabilities

### Modified Capabilities

- `api-security-management`：新增「帳號鎖定列表查詢」。
- `ui-security-management`：新增「帳號鎖定頁路由與導航」與「帳號鎖定 DataTable」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | **無**——鎖定狀態已存在 `members.locked_at`，不需要新表 |
| 環境變數 | 無 |
| API 契約 / Swagger | **新增一支 endpoint**，需 `swagger:bundle` + `api-client generate` |
| 前端 | 新增一頁 + Sidebar 一個項目 |
| 權限 | 沿用 SUPERADMIN role gate，**不新增權限碼**（見 `api-security-management` 的既有決定） |
