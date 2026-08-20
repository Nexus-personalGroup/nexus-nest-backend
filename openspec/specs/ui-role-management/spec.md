# ui-role-management Specification

## Purpose

定義後台「角色管理」前端 UI 行為：`/roles` 路由、列表（DataTable + 分頁 + 搜尋 +
URL state 同步）、新增 / 編輯共用 Dialog、權限分組多選（含「EDIT 蘊含 VIEW」互動限制）、
即時切換啟用狀態（optimistic）、刪除確認。對應後端 `api-role-management` capability，前端
落地於 `apps/web/src/routes/roles/`。

## Requirements

### Requirement: 角色列表頁路由與導航

`apps/web/` SHALL 提供 `/roles` 路由作為角色管理列表頁，並在 Sidebar 加入導向此頁的選項。

- `/roles` 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 新增「角色管理」項目，連到 `/roles`，圖示使用 `lucide-react` 的 `Shield`。
- 使用者沒有 `BACKEND:ROLE:VIEW` 權限時 MUST NOT 看到 Sidebar 的角色管理項目；若直接造訪 `/roles` MUST 導向 `/`。

#### Scenario: 已登入有 VIEW 權限的使用者瀏覽 /roles

- **WHEN** 使用者點 Sidebar 的「角色管理」
- **THEN** 路由跳轉到 `/roles`，渲染 DataTable

#### Scenario: 已登入但無 VIEW 權限直接打 URL

- **WHEN** 使用者在網址列輸入 `/roles`
- **THEN** 自動導向 `/`，不顯示列表

### Requirement: 角色列表 DataTable

`/roles` 頁 SHALL 以 DataTable 顯示角色清單，**5 欄**：名稱 / 使用人數 / 狀態（Switch）/ 建立時間 / 操作。

- DataTable MUST 重用 `apps/web/src/components/data-table/` 的 `DataTable` 與 `DataTablePagination`。
- 「名稱」欄 MUST 在 `isDefault === true` 時於名稱右側加上灰色 badge「預設」。
- 「使用人數」欄 MUST 顯示 `memberCount` 數字。
- 「建立時間」欄 MUST 顯示相對時間（如「3 分鐘前」），hover 顯示絕對 ISO 字串；重用既有 `format-relative-time` helper。
- 「狀態」欄 MUST 使用 shadcn `Switch`，點擊即時切換並觸發 PATCH `/api/roles/:id`。
- 「操作」欄 MUST 使用 shadcn `DropdownMenu`：
  - 至少含「檢視」項（使用者能進到此頁就一定具備 VIEW 權限）。
  - 若使用者具備 `BACKEND:ROLE:EDIT`，再追加「編輯」「刪除」兩項。
- 「狀態」Switch 在使用者沒有 `BACKEND:ROLE:EDIT` 權限時 MUST disabled 並 tooltip 顯示「無編輯權限」。

#### Scenario: 渲染列表

- **WHEN** API `GET /api/roles` 回應成功
- **THEN** DataTable 顯示每一列含名稱（含 isDefault badge 視情況）、使用人數、狀態、建立時間相對時間、操作 dropdown

#### Scenario: 預設角色加灰 badge

- **WHEN** 列上某筆 role 的 `isDefault === true`
- **THEN** 名稱右側顯示灰色 badge「預設」

### Requirement: 分頁與搜尋 URL state 同步

列表頁的分頁與搜尋條件 SHALL 同步到 URL query string，重新整理與分享連結保留狀態。

- 支援的 query 參數：`page`（預設 1）、`limit`（預設後端 `DEFAULT_PAGE_LIMIT`）、`name`、`status`（`'true'` / `'false'` / 省略代表「全部」）、`edit`（編輯中 role 的 uuid）、`view`（檢視中 role 的 uuid，與 edit 互斥）。
- 搜尋輸入 MUST debounce 300ms 後寫入 URL 並觸發新請求（重用既有 `useDebouncedValue` hook）。
- 「狀態」下拉（共用 `StatusFilterSelect`）MUST 即時寫入 URL；切換時 page MUST 重置為 1。
- 狀態為「全部」時 URL MUST 不寫 `status` 參數（避免 URL 噪音）。
- 翻頁按鈕 MUST 改寫 URL `page` 參數而非僅改 component state。
- URL 直接輸入或瀏覽器上一頁 MUST 觸發對應的 list query 與 dialog 開關。

#### Scenario: 使用者搜尋

- **WHEN** 使用者在 search input 輸入 `admin`
- **THEN** 300ms 後 URL 變成 `/roles?name=admin`，DataTable 重新請求並渲染過濾後的結果

#### Scenario: 分享連結保留狀態

- **WHEN** 使用者複製 `/roles?page=2&limit=20&name=admin` 給同事
- **THEN** 同事開啟連結時看到第 2 頁、每頁 20 筆、含 `admin` 的結果

#### Scenario: 使用者篩選停用角色

- **WHEN** 使用者在「狀態」下拉選「停用」
- **THEN** URL 變成 `/roles?status=false`、page 重置為 1，DataTable 重抓只回 `status === false` 的角色

#### Scenario: 切回「全部」清除 URL 參數

- **WHEN** 使用者在「狀態」下拉選「全部」
- **THEN** URL 不再含 `status` 參數，DataTable 重抓回啟用 + 停用兩者

### Requirement: 新增、編輯、檢視共用 Dialog

新增、編輯與檢視 SHALL 走同一個 shadcn `Dialog`，由 mode（`create` / `edit` / `view`）切換按鈕文字、初值與互動行為。`view` 模式所有欄位 MUST disabled、submit 按鈕 MUST 隱藏，取消按鈕文字改為「關閉」；URL 以 `?view=<uuid>` 控制，與 `?edit=<uuid>` 互斥。

- Dialog 表單欄位：名稱 / 權限多選 / 狀態。
- **新增模式**：名稱必填（1-100 字元），提交後 `POST /api/roles`，成功 toast「角色已新增」+ invalidate `['GET', '/roles']` + 關閉 dialog。
- **編輯模式**：欄位同上，初值由 `GET /api/roles/:id` 載入；提交後 `PATCH /api/roles/:id`，成功同上。
- 編輯模式由 URL `?edit=<uuid>` 控制 dialog 開關；重新整理會自動嘗試載入該 uuid 的資料，若 404 / 沒權限 graceful close + toast.error。
- 表單驗證使用 react-hook-form + zod + `standardSchemaResolver`，錯誤即時顯示。
- 提交時的 `permissionCodes` array MUST 去重並依字母排序，與後端比對保持穩定。
- mutation 成功 MUST 同時 invalidate `['GET', '/members/role/options']`，讓會員頁角色 select 反映最新角色。

#### Scenario: 新增成功

- **WHEN** 使用者填完名稱與權限按「儲存」且 API 回 201
- **THEN** 顯示 toast「角色已新增」、列表 invalidate 重抓、dialog 關閉

#### Scenario: 編輯模式由 URL 開啟

- **WHEN** 使用者直接打開 `/roles?edit=<uuid>`
- **THEN** 自動 `GET /api/roles/:id` 載入初值，dialog 開啟可編輯

#### Scenario: 編輯目標不存在

- **WHEN** URL 帶 `?edit=<uuid>` 但該 role 不存在或無權限（API 回 404 / 403）
- **THEN** 顯示 toast「找不到該角色或無權限存取」，dialog 關閉、URL 清掉 `edit` 參數

#### Scenario: 名稱重複

- **WHEN** 新增或編輯時送出的名稱與既有角色重複，後端回 409 + `DUPLICATE_ROLE_NAME`
- **THEN** 顯示 toast「角色名稱已存在」，dialog 不關閉、使用者可調整後重送

### Requirement: 權限多選 — Grouped checkboxes

Dialog 內的權限選擇 SHALL 以分組 checkbox 列表呈現，分組來源為 `GET /api/roles/permissions`。

- 權限選項 MUST 透過 TanStack Query 取得，query key `['GET', '/roles/permissions']`，staleTime 30 分鐘。
- 列表 MUST 依 `platform → module` 分組；每個 module group 內列出該 module 的 `VIEW` / `EDIT` 兩個 checkbox（若後端僅回其中一個，則只列那一個）。
- 每個 module group MUST 提供 group-level「全選 / 全不選」操作（群組標題列右側的小 button）。
- 每個 module 一個 card，內部分兩層：header row（module 名 + 全選 button）+ 垂直 stack 的 checkbox 區，避免長文字 label 換行錯位。
- 表單 state 為 `permissionCodes: string[]`；提交前 MUST `sort()` 並去重。
- 容器 MUST 限制最大高度，內容超過時可滾動（建議 `max-h-[60vh] overflow-auto`）。

#### Scenario: 載入權限清單

- **WHEN** 開啟 create/edit dialog
- **THEN** 依 `GET /api/roles/permissions` 結果以 platform → module 分組顯示，每組列出 VIEW/EDIT checkbox

#### Scenario: group 全選

- **WHEN** 使用者點某 module group 的「全選」
- **THEN** 該 group 內所有 permissionCode（VIEW + EDIT）被加入表單 `permissionCodes`

#### Scenario: group 全不選

- **WHEN** 使用者點某 module group 的「全不選」
- **THEN** 該 group 內所有 permissionCode 從表單 `permissionCodes` 移除

#### Scenario: 提交排序

- **WHEN** 表單送出
- **THEN** 送往後端的 `permissionCodes` 為去重後依字母排序的陣列

### Requirement: 權限蘊含關係 — EDIT 隱含 VIEW

在同一個 module group 內，若同時提供 `VIEW` 與 `EDIT` 兩個 permission，使用者操作 UI 與最終提交內容 SHALL 滿足「EDIT 蘊含 VIEW」的限制。

- 勾選某 module 的 `EDIT` checkbox MUST 自動將同 module 的 `VIEW` 加入表單 `permissionCodes`。
- 當某 module 的 `EDIT` 已勾選時，同 module 的 `VIEW` checkbox MUST 顯示為勾選且 `disabled`，使用者 MUST NOT 能透過點擊將它取消；hover tooltip MUST 顯示「啟用編輯時需具備檢視權限」。
- 取消某 module 的 `EDIT` MUST NOT 自動取消同 module 的 `VIEW`（保留「只給檢視」的設定彈性）；EDIT 取消後 VIEW checkbox MUST 重新可點擊。
- 提交給後端的 `permissionCodes` MUST 滿足「凡含 `X:Y:EDIT` 即必含 `X:Y:VIEW`」；submit handler MUST 在組 POST/PATCH body 之前透過 `normalizePermissionCodes` helper 統一補入缺失的 VIEW 並 sort/去重，作為 defense in depth。
- 若某 module 後端僅提供 VIEW 或僅提供 EDIT 其中一個，視為獨立 checkbox，本規則不套用。

#### Scenario: 勾 EDIT 自動勾 VIEW

- **WHEN** 使用者點選某 module（如 ROLE）的 `EDIT` checkbox（原本兩者皆未勾）
- **THEN** 該 module 的 `VIEW` 同時被自動勾選；`VIEW` checkbox 變成 `disabled` 並維持勾選狀態，hover tooltip 顯示「啟用編輯時需具備檢視權限」

#### Scenario: VIEW 在 EDIT 勾選時無法被取消

- **WHEN** 某 module 的 `EDIT` 已勾選，使用者嘗試點擊同 module 的 `VIEW` checkbox
- **THEN** 該 checkbox 維持勾選狀態，不會被取消（disabled 阻止互動）

#### Scenario: 取消 EDIT 不自動取消 VIEW

- **WHEN** 某 module 的 `EDIT` 與 `VIEW` 都勾選的狀態下，使用者取消 `EDIT`
- **THEN** `EDIT` 被取消，`VIEW` 仍維持勾選且 checkbox 重新可點擊（disabled 解除）

#### Scenario: 提交時自動補 VIEW

- **WHEN** 表單 state 不知何故含某 module 的 EDIT code 但未含對應 VIEW code（例如從 URL 直接帶入或 race condition）
- **THEN** 送往後端的 `permissionCodes` 自動補入該 VIEW code，最後依字母排序、去重

### Requirement: 刪除確認

列表上的「刪除」動作 SHALL 透過 shadcn `AlertDialog` 確認後才發 `DELETE /api/roles/:id`。

- AlertDialog 顯示被刪除角色的名稱與目前使用人數，避免誤刪。
- 確認後成功：toast「角色已刪除」、invalidate `['GET', '/roles']` 與 `['GET', '/members/role/options']`。
- 後端拒絕（`DEFAULT_ROLE_NOT_DELETABLE` / `ROLE_HAS_MEMBERS`）：列表不變，顯示對應 toast 錯誤訊息。

#### Scenario: 確認刪除

- **WHEN** 使用者點 dropdown 的「刪除」，AlertDialog 出現，按「確認刪除」
- **THEN** API 回 204，顯示 toast，DataTable 重抓，已刪角色消失

#### Scenario: 預設角色不可刪除

- **WHEN** 列上某 role 的 `isDefault === true`
- **THEN** dropdown 的「刪除」MUST disabled，hover tooltip 顯示「預設角色不可刪除」

#### Scenario: 有使用者的角色不可刪除

- **WHEN** 列上某 role 的 `memberCount > 0`
- **THEN** dropdown 的「刪除」MUST disabled，hover tooltip 顯示「角色有 N 位使用者，請先移除才能刪除」（N 為實際人數）

### Requirement: 即時切換啟用狀態

列上的「狀態」Switch SHALL 觸發 `PATCH /api/roles/:id` 翻轉啟用狀態，採 optimistic update。

- Switch 切換 MUST 立即在 UI 上反映新狀態（不等 API），失敗 rollback + toast。
- PATCH body MUST 只送 `{ status: !current }`，省略 `name` / `permissionCodes`（後端 update DTO 已支援 status 欄位，省略其他欄位表示不變更）。
- 若使用者試圖切換 `isDefault === true` 的角色，Switch MUST disabled（前端先擋），hover tooltip 顯示「預設角色不可變更狀態」。
- 沒有 `BACKEND:ROLE:EDIT` 權限時 Switch MUST 不顯示（或 disabled）。

#### Scenario: 成功切換

- **WHEN** 管理員點某角色的 status Switch
- **THEN** UI 立刻翻轉狀態，PATCH 204 後保留新狀態，toast 顯示「角色狀態已更新」

#### Scenario: API 失敗 rollback

- **WHEN** PATCH 回 4xx / 5xx
- **THEN** Switch 回到原狀態，toast 顯示錯誤訊息，並 invalidate 重抓 list

#### Scenario: 預設角色 Switch disabled

- **WHEN** 列上某 role 的 `isDefault === true`
- **THEN** 該列的 status Switch 為 disabled，hover tooltip 顯示「預設角色不可變更狀態」

### Requirement: 編輯按鈕對 isDefault 與權限的限制

列上的「編輯」操作 SHALL 在以下情境 disabled：

- `isDefault === true`：disabled，tooltip「預設角色不可編輯」。
- 使用者沒有 `BACKEND:ROLE:EDIT` 權限：整個 dropdown 不顯示，或編輯項 disabled。

#### Scenario: 預設角色編輯按鈕 disabled

- **WHEN** 列上某 role 的 `isDefault === true`
- **THEN** dropdown 的「編輯」disabled，hover tooltip 顯示「預設角色不可編輯」

### Requirement: 新增按鈕對權限的限制

頁面右上的「新增角色」按鈕 SHALL 在使用者沒有 `BACKEND:ROLE:EDIT` 權限時 disabled。

#### Scenario: 無 EDIT 權限

- **WHEN** 使用者只有 `BACKEND:ROLE:VIEW`、沒有 `BACKEND:ROLE:EDIT`
- **THEN** 頁面上的「新增角色」按鈕為 disabled
