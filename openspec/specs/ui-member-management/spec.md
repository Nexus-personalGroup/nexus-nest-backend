# ui-member-management Specification

## Purpose

定義後台「會員管理」前端 UI 行為：`/members` 路由、列表（DataTable + 分頁 + 搜尋 +
URL state 同步）、新增 / 編輯共用 Dialog、即時切換啟用狀態（optimistic）、刪除確認。
對應後端 `api-member-management` capability，前端落地於 `apps/web/src/routes/members/`。

## Requirements
### Requirement: 會員列表頁路由與導航

`apps/web/` SHALL 提供 `/members` 路由作為會員管理列表頁，並在 Sidebar 加入導向此頁的選項。

- `/members` 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 新增「會員管理」項目，連到 `/members`，圖示使用 `lucide-react` 的 `Users`。
- 使用者沒有 `BACKEND:ACCOUNT:VIEW` 權限時 MUST NOT 看到 Sidebar 的會員管理項目；若直接造訪 `/members` MUST 導向 `/`。

#### Scenario: 已登入有 VIEW 權限的使用者瀏覽 /members

- **WHEN** 使用者點 Sidebar 的「會員管理」
- **THEN** 路由跳轉到 `/members`，渲染 DataTable

#### Scenario: 已登入但無 VIEW 權限直接打 URL

- **WHEN** 使用者在網址列輸入 `/members`
- **THEN** 自動導向 `/`，不顯示列表

### Requirement: 會員列表 DataTable

`/members` 頁 SHALL 以 DataTable 顯示會員清單，**6 欄**：名稱 / Email / 角色 / 狀態（Switch）/ 最後登入時間 / 操作。

- DataTable MUST 基於 TanStack Table + shadcn `Table` 元件實作，落地於 `apps/web/src/components/data-table/`。
- 「最後登入時間」MUST 顯示相對時間（如「3 分鐘前」），hover 顯示絕對時間 ISO 字串；若 `lastLoginAt` 為 `null` 顯示「—」。
- 「狀態」欄 MUST 使用 shadcn `Switch`，點擊即時切換並觸發 `PATCH /members/:id`。
- 「操作」欄 MUST 使用 shadcn `DropdownMenu`：
  - 至少含「檢視」項（會員若能進到此頁就一定具備 VIEW 權限）。
  - 若使用者具備 `BACKEND:ACCOUNT:EDIT`，再追加「編輯」「刪除」兩項。
- 「狀態」Switch 在使用者沒有 `BACKEND:ACCOUNT:EDIT` 權限時 MUST disabled 並 tooltip 顯示「無編輯權限」。

#### Scenario: 渲染列表

- **WHEN** API `GET /members` 回應成功
- **THEN** DataTable 顯示每一列含名稱 / Email / 角色名 / 啟用狀態 / 最後登入 / 操作

#### Scenario: 最後登入為 null

- **WHEN** 某會員從未登入過（`lastLoginAt = null`）
- **THEN** 該欄顯示「—」（dash）

### Requirement: 分頁與搜尋 URL state 同步

列表頁的分頁與搜尋條件 SHALL 同步到 URL query string，重新整理與分享連結保留狀態。

- 支援的 query 參數：`page`（預設 1）、`limit`（預設後端 `DEFAULT_PAGE_LIMIT`）、`name`、`email`、`status`（`'true'` / `'false'` / 省略代表「全部」）、`edit`（編輯中 member 的 uuid）、`view`（檢視中 member 的 uuid，與 edit 互斥）。
- 搜尋輸入 MUST debounce 300ms 後寫入 URL 並觸發新請求。
- 「狀態」下拉（共用 `StatusFilterSelect`）MUST 即時寫入 URL；切換時 page MUST 重置為 1。
- 狀態為「全部」時 URL MUST 不寫 `status` 參數（避免 URL 噪音）。
- 翻頁按鈕 MUST 改寫 URL `page` 參數而非僅改 component state。
- URL 直接輸入或瀏覽器上一頁 MUST 觸發對應的 list query 與 dialog 開關。

#### Scenario: 使用者搜尋

- **WHEN** 使用者在 search input 輸入 `alan`
- **THEN** 300ms 後 URL 變成 `/members?name=alan`，DataTable 重新請求並渲染過濾後的結果

#### Scenario: 分享連結保留狀態

- **WHEN** 使用者複製 `/members?page=2&limit=20&name=alan` 給同事
- **THEN** 同事開啟連結時看到第 2 頁、每頁 20 筆、含 `alan` 的結果

#### Scenario: 使用者篩選停用會員

- **WHEN** 使用者在「狀態」下拉選「停用」
- **THEN** URL 變成 `/members?status=false`、page 重置為 1，DataTable 重抓只回 `status === false` 的會員

#### Scenario: 切回「全部」清除 URL 參數

- **WHEN** 使用者在「狀態」下拉選「全部」
- **THEN** URL 不再含 `status` 參數，DataTable 重抓回啟用 + 停用兩者

### Requirement: 新增、編輯、檢視共用 Dialog

新增、編輯與檢視 SHALL 走同一個 shadcn `Dialog`，由 mode（`create` / `edit` / `view`）切換按鈕文字、初值與互動行為。`view` 模式所有欄位 MUST disabled、密碼欄位 MUST 隱藏、submit 按鈕 MUST 隱藏，取消按鈕文字改為「關閉」；URL 以 `?view=<uuid>` 控制，與 `?edit=<uuid>` 互斥。

- Dialog 表單欄位：Email / 名稱 / 密碼 / 角色 / 狀態。
- **新增模式**：密碼必填（8-30 字元）；提交後 `POST /members`，成功 toast + invalidate list + 關閉 dialog。
- **編輯模式**：密碼選填（**空字串視為不改**）；提交後 `PATCH /members/:id`，成功同上。
- 角色欄位使用 cmdk 為基底的 Combobox（`RoleCombobox`）渲染，內部以 `useInfiniteQuery` 從 `GET /api/members/role/options?page=&limit=&search=` 分頁取得角色清單，下拉清單滾到底時透過 IntersectionObserver 觸發 `fetchNextPage`。
- Combobox 內含搜尋輸入；輸入經 `useDebouncedValue` debounce 300ms 後寫入 query 觸發新搜尋。
- 角色選項以 `id` 去重；`isAssignable === false` 的選項 MUST disabled 並標示「（預設）」（與角色列表 badge 一致），使用者 MUST NOT 能將其指派給新建 / 編輯中的會員。判斷邏輯由後端推導後傳回，前端只看 `isAssignable` 旗標。
- 編輯模式時若初值的 `roleId` 不在分頁第一頁，Combobox MUST 並列 fetch `GET /api/members/role/options/:id` 取得 fallback option，將其合併進顯示清單頂端，確保使用者能看到既有角色名稱與 `isAssignable` 狀態。fallback fetch 失敗（404）時 Combobox MUST 顯示「（已停用 / 不可用）」並維持 roleId 為當前值。
- 角色 query 的 staleTime 維持 10 分鐘；endpoint 仍需 `BACKEND:ACCOUNT:VIEW` 權限。
- 表單驗證使用 react-hook-form + zod + `standardSchemaResolver`，錯誤即時顯示在欄位下方。
- 編輯模式由 URL `?edit=<uuid>` 控制 dialog 開關；重新整理會自動嘗試載入該 uuid 的資料，若 404 / 沒權限 graceful close + toast。

#### Scenario: 新增成功

- **WHEN** 使用者填完欄位按「儲存」且 API 回 201
- **THEN** 顯示 toast「會員已新增」、列表 invalidate 重抓、dialog 關閉

#### Scenario: 編輯時密碼空白

- **WHEN** 使用者開啟編輯 dialog，只改名稱，密碼欄留空，按儲存
- **THEN** PATCH body 不含 password 欄位（或送空字串由後端 schema 轉 undefined），會員密碼不變

#### Scenario: Email 重複

- **WHEN** 新增時 email 已存在，後端回 409 + `EMAIL_ALREADY_EXISTS`
- **THEN** 顯示 toast「Email 已被使用」，dialog 不關閉，使用者可調整後重送

#### Scenario: 角色 Combobox 載入分頁

- **WHEN** 使用者開啟 dialog 並點開角色 Combobox
- **THEN** 顯示第一頁前 20 筆角色；滾動到清單底端時自動載入下一頁直到 `hasNextPage === false`

#### Scenario: 角色搜尋

- **WHEN** 使用者在 Combobox 搜尋輸入框輸入 `admin`
- **THEN** 300ms 後重新打 `GET /api/members/role/options?search=admin&page=1`，清單顯示符合條件的角色

#### Scenario: 預設角色 disabled

- **WHEN** Combobox 清單中出現 `isAssignable === false` 的角色（目前對應 `roleCode === 'SUPERADMIN'`）
- **THEN** 該選項 disabled 並標示「（預設）」，使用者點擊 MUST NOT 變更表單 `roleId`

#### Scenario: 編輯模式 fallback option

- **WHEN** 使用者開啟編輯 dialog，初值 `roleId` 不在第一頁範圍內
- **THEN** Combobox 並列 fetch `GET /api/members/role/options/:id`，將該角色合併進顯示清單頂端，使用者能看見當前角色名稱（並維持 `isAssignable=false` disabled 行為）

#### Scenario: 編輯模式 fallback 角色已停用

- **WHEN** 使用者開啟編輯 dialog，初值 `roleId` 對應的角色已停用或軟刪除（API 回 404）
- **THEN** Combobox 維持 roleId 為當前值並顯示「（已停用 / 不可用）」placeholder，使用者可選別的啟用中角色覆蓋

### Requirement: 刪除確認

列表上的「刪除」動作 SHALL 透過 shadcn `AlertDialog` 確認後才發 `DELETE /members/:id`。

- AlertDialog 顯示被刪除會員的 email 與名稱，避免誤刪。
- 確認後成功：toast「會員已刪除」、invalidate list。
- 後端拒絕（`CANNOT_DELETE_SELF` 等）：保持列表不變，顯示 toast 錯誤訊息。

#### Scenario: 確認刪除

- **WHEN** 使用者點 dropdown 的「刪除」，AlertDialog 出現，按「確認刪除」
- **THEN** API 回 204，顯示 toast，DataTable 重抓，已刪會員消失

#### Scenario: 試圖刪自己

- **WHEN** 使用者刪除 actor 自己的帳號
- **THEN** API 回 409，toast 顯示「不能刪除自己的帳號」，列表不變

### Requirement: 即時切換啟用狀態

列上的「狀態」Switch SHALL 觸發 `PATCH /members/:id` 翻轉啟用狀態，採 optimistic update。

- Switch 切換 MUST 立即在 UI 上反映新狀態（不等 API），失敗 rollback + toast。
- PATCH body MUST 帶該列完整的更新必要欄位（email / 名稱 / 角色 / 翻轉後的 status），密碼欄位不帶。
- 若使用者試圖切換自己的狀態，Switch MUST disabled（前端先擋）。

#### Scenario: 成功切換

- **WHEN** 管理員點某會員的 status Switch
- **THEN** UI 立刻翻轉狀態，PATCH 200 後保留新狀態，toast 顯示「會員狀態已更新」

#### Scenario: API 失敗 rollback

- **WHEN** PATCH 回 500
- **THEN** Switch 回到原狀態，toast 顯示錯誤訊息

#### Scenario: 切換自己的帳號

- **WHEN** 列表中某列的 id 等於目前登入使用者的 sub
- **THEN** 該列的 status Switch 為 disabled，hover tooltip 顯示「不能停用自己的帳號」

### Requirement: 全域 Sonner Toast

`apps/web/` SHALL 使用 shadcn 提供的 `sonner` 作為全域 toast 通知。

- `App.tsx` 必須掛 `<Toaster />` 元件一次。
- 業務頁透過 `toast.success(...)` / `toast.error(...)` / `toast.info(...)` 觸發訊息。
- toast 文字 MUST 為繁體中文。
- 統一 placement（預設右上或右下，跟 shadcn 預設一致）。

#### Scenario: 成功動作顯示綠色 toast

- **WHEN** 任一 mutation 成功
- **THEN** 畫面右側出現帶綠色標記的 toast，3 秒後自動消失

