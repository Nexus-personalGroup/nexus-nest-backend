## MODIFIED Requirements

### Requirement: 會員列表頁路由與導航

`apps/web/` SHALL 提供 `/members` 路由作為**管理者帳號**列表頁，並在 Sidebar 加入導向此頁的選項。

- `/members` 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 在**「管理者與權限」群組**新增「管理者帳號」項目，連到 `/members`，
  圖示使用 `lucide-react` 的 `Users`。
- 使用者沒有 `BACKEND:ACCOUNT:VIEW` 權限時 MUST NOT 看到該項目；若直接造訪 `/members` MUST 導向 `/`。

**標籤 MUST NOT 是「會員管理」**：`/members` 管的是**後台管理員帳號**，不是會員。
那個標籤曾經與 `/front-users`（前台會員）同處一組，兩個都以「會員」結尾，
掃過去要停下來讀完才分得出來——而**靠讀者仔細讀標籤的設計遲早會被讀錯**，
讀錯的後果是在錯的體系裡找人然後以為對方不存在。

#### Scenario: 已登入有 VIEW 權限的使用者瀏覽 /members

- **WHEN** 使用者點 Sidebar 的「管理者帳號」
- **THEN** 路由跳轉到 `/members`，渲染 DataTable

#### Scenario: 已登入但無 VIEW 權限直接打 URL

- **WHEN** 使用者在網址列輸入 `/members`
- **THEN** 自動導向 `/`，不顯示列表

#### Scenario: ⭐ 與前台會員分屬不同群組

- **WHEN** 登入者同時具備 `BACKEND:ACCOUNT:VIEW` 與 `BACKEND:FRONT_USER:VIEW`
- **THEN** 兩個入口 MUST 位於不同的 sidebar group
