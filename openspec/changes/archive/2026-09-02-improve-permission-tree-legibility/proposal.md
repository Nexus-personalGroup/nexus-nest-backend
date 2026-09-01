## Why

角色表單的權限樹**讀不出「這個角色實際上能做什麼」**，三個原因各自獨立：

**① 群組標題是英文的權限碼片段。** `BACKEND` / `ACCOUNT` / `FRONT_USER` 是
前端把 `BACKEND:ACCOUNT:VIEW` 切開來直接顯示的結果，沒有經過任何中文對照。
底下的項目名稱倒是中文，於是同一張卡片上半英下中。

**② 項目名稱與側邊欄對不上。** `improve-admin-orientation` 把側邊欄改成
「管理者帳號」「會員列表」，但權限樹還寫著「帳號管理」「前台會員」。
**這是上一支 change 造成的漂移**——分組的命名跟過來了，權限目錄沒有。
後果是指派權限的人得自己在腦中做一次翻譯。

**③ 安全管理在權限樹上完全不存在。** IP 白名單 / IP 黑名單 / 帳號解鎖由
`@Roles(SUPERADMIN)` 保護、沒有權限碼，所以權限樹上沒有它們。使用者看到的是
「後台有這兩頁，但權限設定裡找不到」——**看起來像漏掉，實際上是刻意的**
（見 `api-security-management` 的 Purpose：能改 IP 名單等同能繞過所有 IP 層防護）。
問題不在那個決定，在於**那個決定在 UI 上不可見**。

順帶解掉一條自相矛盾的既有需求：`ui-role-management` 的「編輯按鈕對 isDefault
與權限的限制」寫著「整個 dropdown 不顯示，**或**編輯項 disabled」——
一條需求給了兩個答案，而實作正好兩種都用了。

## What Changes

- **權限樹群組標題中文化**：`BACKEND` → 後台、`ACCOUNT` → 管理者帳號、
  `ROLE` → 角色權限、`FRONT_USER` → 會員管理、`MODERATION` → 聊天管理、
  `ATTACHMENT` → 附件。對照表放前端並加守則擋漂移（見 design D1）。
- **權限名稱對齊側邊欄命名**：`PERMISSION_CATALOG` 的
  「後台-帳號管理-*」→「後台-管理者帳號-*」、「後台-前台會員-*」→「後台-會員管理-*」。
- **權限樹新增「安全管理」不可指派區塊**：列出 IP 白名單 / IP 黑名單 / 帳號解鎖，
  標示「限超級管理者，不可指派」、checkbox disabled、tooltip 說明理由。
  **不動任何守衛**——安全模型維持原樣，只是讓它在 UI 上看得見（見 design D2）。
- **把「什麼時候 disabled、什麼時候隱藏」寫成明文**：列內動作隱藏、
  頁面級動作與處置動作 disabled + tooltip。這個分界目前**只存在於實作**，
  spec 反而寫著「不顯示**或** disabled」。同時補一支守則（見 design D3）。

**不做**：不新增 `BACKEND:SECURITY:*` 權限碼、不改 `SecurityController` 的守衛
（見 design D2）；不動 `ATTACHMENT`（見 design D4）;
不拆 `MODERATION`（一個碼管三個頁面是刻意的，見 design D5）。

## Capabilities

### Modified Capabilities

- `ui-role-management`：
  - **修改**「權限多選 — Grouped checkboxes」——群組標題改中文，並新增不可指派區塊的呈現規則。
  - **修改**「編輯按鈕對 isDefault 與權限的限制」——把「不顯示**或** disabled」
    的二選一改成單一答案（列內動作隱藏）。
  - **新增**「不可指派的權限必須可見」。

### Added Capabilities

- `platform-frontend-conventions`：新增「動作控制項的權限呈現規則」——
  依控制項的層級決定隱藏或 disabled。
- `platform-engineering-guardrails`：新增兩支守則——權限模組的中文對照必須齊全、
  不可指派清單必須與後端的 `@Roles(SUPERADMIN)` 一致。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| 權限碼 | **無新增、無移除**。只改 `PERMISSION_CATALOG` 的 `name` 顯示字串 |
| 部署相依 | **需重跑 `pnpm --filter @app/api db:seed`**——`name` 改了要同步到 DB，seed 是 `alwaysRun` upsert，重跑安全 |
| API 契約 / Swagger | 無（`GET /roles/permissions` 的欄位不變，只是 `name` 的值變了） |
| 前端 | `PermissionsField` / `group-permissions` / 新增對照表與不可指派清單 |
