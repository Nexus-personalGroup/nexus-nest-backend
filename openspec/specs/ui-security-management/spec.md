# ui-security-management Specification

## Purpose

定義後台「安全」前端 UI 行為：`/security/ip-whitelist` 與 `/security/ip-blacklist`
兩個列表頁面，未來新增的安全相關前端模組（如帳號鎖定管理）也歸入此 capability。
對應後端 `api-security-management` capability，前端落地於 `apps/web/src/routes/security/`，
與 sidebar「安全」group 對接（`requiredRoleCode: 'SUPERADMIN'` 過濾）。

## Requirements

### Requirement: IP 白名單頁路由與導航

`apps/web/` SHALL 提供 `/security/ip-whitelist` 路由作為 IP 白名單管理列表頁。

- 路由 MUST 受 `RequireAuth` 保護。
- 使用者 roleCode 非 `SUPERADMIN` MUST 不可進入；直接打 URL 由 `useCurrentMember().roleCode` 檢查後 `<Navigate to="/" />`。
- Sidebar「安全」group 加一筆「IP 白名單」項目，圖示 `lucide-react.ShieldCheck`，`requiredRoleCode: 'SUPERADMIN'`。

#### Scenario: SUPERADMIN 點 sidebar

- **WHEN** SUPERADMIN 點 Sidebar「IP 白名單」
- **THEN** 進到 `/security/ip-whitelist`，渲染 DataTable

#### Scenario: 非 SUPERADMIN 直接打 URL

- **WHEN** 一般 admin 在網址列輸入 `/security/ip-whitelist`
- **THEN** 自動導向 `/`

### Requirement: IP 白名單 DataTable

`/security/ip-whitelist` SHALL 以 DataTable 顯示 IP 白名單，5 欄：IP / 描述 / 建立者 / 建立時間 / 操作。

- 「建立者」欄顯示 `createdBy` uuid（不做 join member name 對映）；null 顯示「—」。
- 「建立時間」欄顯示相對時間，hover ISO；重用 `format-relative-time`。
- 「操作」欄 dropdown 含「檢視」「編輯」「刪除」三項；無 role gate 過濾（能進此頁就一定是 SUPERADMIN）。
- 分頁 / 搜尋（IP 模糊）/ edit / view URL state 同步。

#### Scenario: 渲染列表

- **WHEN** `GET /api/security/ip-whitelist` 回應成功
- **THEN** DataTable 顯示每一列 5 欄

### Requirement: IP 白名單新增 / 編輯 / 檢視共用 Dialog

新增、編輯、檢視 SHALL 走同一個 shadcn `Dialog`（`IpWhitelistFormDialog`），由 mode（`create` / `edit` / `view`）切換行為。

- 表單欄位：IP（必填，create 時可編輯；edit / view 時 disabled）/ 描述（必填，create / edit 皆可改；view disabled）。
- create：提交後 `POST /api/security/ip-whitelist`，成功 toast「白名單已新增」+ invalidate list + 關閉 dialog。
- edit：由 URL `?edit=<uuid>` 控制；初值從 `GET /api/security/ip-whitelist/:id` 載入；提交 `PATCH /api/security/ip-whitelist/:id`。
- view：由 URL `?view=<uuid>` 控制；欄位全 disabled、無 submit、取消改「關閉」。
- IP 重複（資料庫 unique constraint 抓出）：toast「該 IP 已存在白名單」。

#### Scenario: 新增成功

- **WHEN** 使用者填完 IP 與描述按「新增」且 API 回 201
- **THEN** 顯示 toast、列表 invalidate 重抓、dialog 關閉

#### Scenario: 編輯時 IP 不可改

- **WHEN** 使用者開啟編輯 dialog
- **THEN** IP 欄位 disabled，只能改描述

#### Scenario: 編輯 GET 失敗

- **WHEN** `?edit=<uuid>` 的記錄不存在（404）
- **THEN** toast.error「找不到該紀錄或無權限存取」，關閉 dialog 並清掉 URL `edit` 參數

### Requirement: IP 白名單刪除確認

刪除動作 SHALL 透過 shadcn `AlertDialog` 確認後才發 `DELETE /api/security/ip-whitelist/:id`。

- AlertDialog 顯示被刪除的 IP 與描述。
- 後端為硬刪，文案 MUST 提醒「此操作無法復原」。
- 確認成功 toast「白名單已刪除」+ invalidate list。

#### Scenario: 硬刪提示

- **WHEN** 使用者點操作 dropdown 的「刪除」
- **THEN** AlertDialog 顯示「此操作無法復原（硬刪除）」說明

### Requirement: IP 黑名單頁路由與導航

`apps/web/` SHALL 提供 `/security/ip-blacklist` 路由作為 IP 黑名單管理列表頁。

- 路由保護與導航邏輯同 whitelist；sidebar「安全」group 加「IP 黑名單」，圖示 `lucide-react.ShieldBan`。

#### Scenario: SUPERADMIN 點 sidebar

- **WHEN** SUPERADMIN 點 Sidebar「IP 黑名單」
- **THEN** 進到 `/security/ip-blacklist`

#### Scenario: 非 SUPERADMIN 直接打 URL

- **WHEN** 一般 admin 在網址列輸入 `/security/ip-blacklist`
- **THEN** 自動導向 `/`

### Requirement: IP 黑名單 DataTable

`/security/ip-blacklist` SHALL 以 DataTable 顯示 IP 黑名單，6 欄：IP / 原因 / 來源 / 建立者 / 建立時間 / 操作。

- 「來源」欄顯示 badge：`isAutoBlock=true` 顯示「自動」（destructive 色）、`false` 顯示「手動」（muted 色）。
- 其他欄位處理同 whitelist。

#### Scenario: 渲染列表

- **WHEN** `GET /api/security/ip-blacklist` 回應成功
- **THEN** DataTable 顯示每一列 6 欄；`isAutoBlock` 欄顯示對應 badge

### Requirement: IP 黑名單新增 / 編輯 / 檢視共用 Dialog

新增、編輯、檢視 SHALL 走同一個 shadcn `Dialog`（`IpBlacklistFormDialog`）。

- 表單欄位：IP（create 可編輯，edit / view disabled）/ 原因（create / edit 可改；view disabled）。
- create 提交後 `POST /api/security/ip-blacklist`，成功 toast「黑名單已新增」；後續同 whitelist pattern。
- `isAutoBlock` 不出現在表單（系統自動加入時才會是 true，admin 手動只能建 false 的紀錄）。

#### Scenario: 新增成功

- **WHEN** 使用者填完 IP 與原因按「新增」
- **THEN** API 回 201、toast、列表 invalidate

### Requirement: IP 黑名單刪除確認

刪除動作 SHALL 透過 shadcn `AlertDialog` 確認後才發 `DELETE /api/security/ip-blacklist/:id`；後端硬刪，AlertDialogDescription MUST 提醒「此操作無法復原」。確認成功 toast「黑名單已刪除」+ invalidate list。

#### Scenario: 硬刪提示

- **WHEN** 使用者點刪除
- **THEN** AlertDialog 顯示「此操作無法復原（硬刪除）」說明
