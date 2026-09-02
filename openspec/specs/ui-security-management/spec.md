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

### Requirement: 帳號鎖定頁路由與導航

`apps/web/` SHALL 提供 `/security/account-locks` 帳號鎖定頁，並在 Sidebar 的
「安全管理」群組加入入口。

- 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- 授權沿用 security 模組的 SUPERADMIN role gate，**MUST NOT 以權限碼判斷**
  ——那與後端不一致（見 `api-security-management` 的 Purpose）。
- Sidebar 項目 MUST 與 IP 白名單 / 黑名單同組，圖示使用 `lucide-react` 的 `LockKeyhole`。

#### Scenario: 從 Sidebar 進入

- **WHEN** 超級管理者點「帳號鎖定」
- **THEN** 導向 `/security/account-locks` 並載入列表

#### Scenario: 非超級管理者

- **WHEN** 非 SUPERADMIN 的使用者直接輸入該網址
- **THEN** 與其他 security 頁面一致地被擋下

### Requirement: 帳號鎖定 DataTable

`/security/account-locks` SHALL 以 DataTable 顯示有鎖定紀錄的帳號，**5 欄**：
Email / 名稱 / 鎖定時間 / 自動解鎖時間 / 操作。

- **狀態 MUST 看得出來**：以 Badge 區分「鎖定中」與「已到期」，
  MUST NOT 只顯示時間讓使用者自己心算。
- 「自動解鎖時間」MUST 同時顯示相對時間（例如「還有 12 分鐘」）——
  管理員要判斷的是「還要等多久」，絕對時間要自己算。
- 狀態過濾 MUST 提供「鎖定中 / 已到期 / 全部」，**預設鎖定中**。
- 分頁與過濾狀態 MUST 同步到 URL query。
- 空狀態的文案 MUST 表達「目前沒有帳號被鎖定」，MUST NOT 只顯示「無資料」
  ——前者是一個好消息，後者看起來像載入失敗。
- **`lockEnabled` 為 `false` 時 MUST 顯示明顯的停用提示**，並說明如何啟用。
  帳號鎖定預設關閉，而關閉時系統不會產生任何鎖定紀錄——此時
  「目前沒有帳號被鎖定」是**錯的**：不是沒有人被鎖，是根本不會鎖。
  兩者在畫面上長得一模一樣，而它們的意義相反。

**解鎖 MUST 呼叫既有的 `POST /api/admin/security/unlock-account`**，
MUST NOT 新增解鎖端點——列表已經拿得到 email，兩支做同一件事的端點會各自演化。

- 解鎖 MUST 先經確認對話框，並說明後果（該帳號可立即再次嘗試登入，失敗計數歸零）。
- **已到期的列 MUST NOT 提供可按的解鎖**：後端對非鎖定中的帳號回 `409`，
  提供一個按下去必定失敗的按鈕比沒有按鈕更糟。
- 已到期的列 MUST 以 **disabled + 說明**（例如「已自動解鎖」）呈現，MUST NOT 隱藏。
  這與 `platform-frontend-conventions` 一致：**因資料狀態而不可操作時 disabled 並說明**，
  隱藏只用於權限不足。使用者需要知道「這個人已經可以登入了」，
  而不是以為功能不見了。

#### Scenario: 預設載入

- **WHEN** 使用者進入 `/security/account-locks`
- **THEN** 顯示狀態為「鎖定中」的帳號，依鎖定時間由新到舊

#### Scenario: ⭐ 解鎖一個鎖定中的帳號

- **WHEN** 管理員對鎖定中的列按下解鎖並確認
- **THEN** 呼叫 `POST /api/admin/security/unlock-account` 帶該列的 email，
  成功後列表重新載入且該列消失（狀態已不再是鎖定中）

#### Scenario: ⭐ 已到期的列

- **WHEN** 某列的狀態為「已到期」
- **THEN** 解鎖為 disabled 並顯示原因，MUST NOT 可按下

#### Scenario: ⭐ 帳號鎖定功能停用

- **WHEN** 回應的 `lockEnabled` 為 `false`
- **THEN** 頁面 MUST 顯示停用提示並說明啟用方式，
  MUST NOT 只顯示空清單——那會讓人以為防護正常運作

#### Scenario: 沒有帳號被鎖定

- **WHEN** 查詢結果為空
- **THEN** 顯示「目前沒有帳號被鎖定」，MUST NOT 顯示錯誤或空白畫面

