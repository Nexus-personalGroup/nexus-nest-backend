## MODIFIED Requirements

### Requirement: 權限多選 — Grouped checkboxes

Dialog 內的權限選擇 SHALL 以分組 checkbox 列表呈現，分組來源為 `GET /api/roles/permissions`。

- 權限選項 MUST 透過 TanStack Query 取得，query key `['GET', '/roles/permissions']`，staleTime 30 分鐘。
- 列表 MUST 依 `platform → module` 分組；每個 module group 內列出該 module 的 `VIEW` / `EDIT` 兩個 checkbox（若後端僅回其中一個，則只列那一個）。
- **platform 與 module 的標題 MUST 顯示中文**，MUST NOT 直接顯示權限碼片段
  （`BACKEND` / `ACCOUNT` / `FRONT_USER`）。中文用語 MUST 與側邊欄的分組一致——
  指派權限的人與使用後台的人是同一批，兩處不同的用語等於要他們自己做一次翻譯。
- 對照表缺少某個 module 時 MUST 退回顯示原始碼片段而非空白，
  且該情形 MUST 由自動化檢查在合併前擋下（見 `platform-engineering-guardrails`）。
- 每個 module group MUST 提供 group-level「全選 / 全不選」操作（群組標題列右側的小 button）。
- 每個 module 一個 card，內部分兩層：header row（module 名 + 全選 button）+ 垂直 stack 的 checkbox 區，避免長文字 label 換行錯位。
- 表單 state 為 `permissionCodes: string[]`；提交前 MUST `sort()` 並去重。
- 容器 MUST 限制最大高度，內容超過時可滾動（建議 `max-h-[60vh] overflow-auto`）。

#### Scenario: 載入權限清單

- **WHEN** 開啟 create/edit dialog
- **THEN** 依 `GET /api/roles/permissions` 結果以 platform → module 分組顯示，每組列出 VIEW/EDIT checkbox

#### Scenario: ⭐ 群組標題的語言

- **WHEN** 權限樹渲染任一 platform 或 module 標題
- **THEN** 顯示中文（例：`後台` / `管理者帳號`），MUST NOT 出現 `BACKEND` / `ACCOUNT`

#### Scenario: group 全選

- **WHEN** 使用者點某 module group 的「全選」
- **THEN** 該 group 內所有 permissionCode（VIEW + EDIT）被加入表單 `permissionCodes`

#### Scenario: group 全不選

- **WHEN** 使用者點某 module group 的「全不選」
- **THEN** 該 group 內所有 permissionCode 從表單 `permissionCodes` 移除

#### Scenario: 提交排序

- **WHEN** 表單送出
- **THEN** 送往後端的 `permissionCodes` 為去重後依字母排序的陣列

### Requirement: 編輯按鈕對 isDefault 與權限的限制

列上的「編輯」操作 SHALL 在以下情境有不同呈現：

- `isDefault === true`：disabled，tooltip「預設角色不可編輯」。
- 使用者沒有 `BACKEND:ROLE:EDIT` 權限：**該列的編輯操作隱藏**。

**兩者不是同一種情況，所以呈現方式不同**：`isDefault` 是「這一筆資料的性質」，
使用者換一筆就能編輯，因此要說明為什麼不能動；沒有權限則是「這個功能對你不開放」，
每一列都放一顆點不下去的按鈕只是噪音。完整規則見
`platform-frontend-conventions` 的「動作控制項的權限呈現規則」。

#### Scenario: 預設角色編輯按鈕 disabled

- **WHEN** 列上某 role 的 `isDefault === true`
- **THEN** dropdown 的「編輯」disabled，hover tooltip 顯示「預設角色不可編輯」

#### Scenario: ⭐ 沒有 EDIT 權限

- **WHEN** 使用者只有 `BACKEND:ROLE:VIEW`
- **THEN** 列上的編輯操作不渲染，MUST NOT 以 disabled 的形式出現

## ADDED Requirements

### Requirement: 不可指派的權限必須可見

權限樹 SHALL 顯示「後台存在、但無法透過角色指派」的功能，並說明原因。

目前唯一的這類功能是安全管理（IP 白名單 / IP 黑名單 / 帳號解鎖）——
它由 `@Roles(SUPERADMIN)` 保護而非權限碼，因此不會出現在
`GET /api/roles/permissions` 的回應裡。

- 這些項目 MUST 以 checkbox disabled 的形式呈現、MUST 標示「限超級管理者」，
  並 MUST 以 tooltip 說明理由（能改 IP 名單等同能繞過所有 IP 層防護）。
- 它們 MUST NOT 可勾選，MUST NOT 進入表單的 `permissionCodes`。
- 清單來源為前端常數（後端沒有對應的權限碼可回傳），因此
  MUST 有自動化檢查確認後端的守衛未改變（見 `platform-engineering-guardrails`）。

**缺席才是問題所在**：不顯示的話，使用者看到後台有 IP 白名單頁、
權限設定裡卻找不到它，會合理地判斷成「權限漏設了」而去找人回報。
顯示成不可指派則當場回答了那個問題。

#### Scenario: ⭐ 安全管理出現在權限樹上

- **WHEN** 開啟角色的新增或編輯 dialog
- **THEN** 權限樹含一個「安全管理」區塊，列出三項且皆 disabled

#### Scenario: ⭐ 嘗試指派不可指派的項目

- **WHEN** 使用者點擊安全管理區塊的任一 checkbox
- **THEN** 狀態不變，表單的 `permissionCodes` 不包含任何安全管理相關的值

#### Scenario: 說明為什麼不可指派

- **WHEN** 使用者 hover 安全管理的任一項
- **THEN** tooltip 說明該功能限超級管理者，而非只顯示「無權限」
