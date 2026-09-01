## MODIFIED Requirements

### Requirement: Sidebar 多項目導航與權限可見性

Sidebar SHALL 支援多項目分組導航、依使用者權限動態決定哪些項目可見，footer 提供登出按鈕。

- Sidebar 項目 MUST 集中宣告為一份資料結構（`routes/_nav-items.ts`），每筆 NavItem 包含：
  - `label` / `path` / `icon`（必要）
  - `group?: string`：屬於哪個 sidebar group（如「管理者與權限」「安全管理」）；未指定為「無 group」獨立顯示於最上。
  - `requiredPermission?: string`：細粒度權限門檻，使用者 permissions 不含此 code 時項目隱藏。
  - `requiredRoleCode?: 'SUPERADMIN'`：粗粒度 role 門檻（與 permission 並用，兩者皆通才顯示）；給 security 等 SUPERADMIN-only 模組用。
- 渲染邏輯 MUST 滿足：
  1. 先依 `requiredPermission` 與 `requiredRoleCode` 過濾出可見項目。
  2. 依 `group` 分組；每組渲染一個 `<SidebarGroup>` + `<SidebarGroupLabel>`（label 顯示 group 名）。
  3. 無 group 的項目（如「首頁」）獨立成一塊，固定排在所有 group 之上。
  4. 若某 group 過濾後完全空（所有 item 都被權限擋掉），整個 group MUST NOT 渲染，連 SidebarGroupLabel 都不出現。
- Sidebar footer MUST 提供「登出」按鈕，點擊執行 `tokenStorage.clear` + `queryClient.clear` + navigate('/login')。

**分組 MUST 依「管理的對象是誰」切分，MUST NOT 依「屬於哪個系統」。**

兩個帳號體系（後台管理員與前台會員）曾經同處一個「使用者與權限」群組，
靠標籤的前綴區分（「會員管理」vs「前台會員」）。那**不夠**：
兩個標籤都以「會員」結尾，掃過去要停下來讀完才分得出來，
而**靠讀者仔細讀標籤的設計遲早會被讀錯**——讀錯的後果是在錯的體系裡找人，
然後以為那個人不存在。

「管理者 / 會員」說的是**是誰**，「後台 / 前台」說的是**在哪個系統**。
操作者腦中的問題是前者，因此分組用前者。

group 名稱 MUST NOT 依賴 item 標籤的前綴來消除歧義——
**分組本身就該讓人知道自己在哪一區**。

#### Scenario: 無 BACKEND:ACCOUNT:VIEW 權限

- **WHEN** 使用者登入後 permissions 不含 `BACKEND:ACCOUNT:VIEW`
- **THEN** Sidebar 不顯示「管理者帳號」項目；若「管理者與權限」group 內所有項目都因權限被擋，整個 group 連 label 也不出現

#### Scenario: 非 SUPERADMIN 角色

- **WHEN** 使用者 roleCode 非 `'SUPERADMIN'`
- **THEN** Sidebar「安全管理」group 整組（含 label）不顯示，無論使用者其他 permissions 為何

#### Scenario: ⭐ 兩個帳號體系的入口

- **WHEN** 使用者同時具備 `BACKEND:ACCOUNT:VIEW` 與 `BACKEND:FRONT_USER:VIEW`
- **THEN** 兩者 MUST 分屬**不同的 group**，MUST NOT 同處一組而僅靠標籤前綴區分

#### Scenario: 新增一個管理對象不同的模組

- **WHEN** 新增的模組管理的對象與既有 group 都不同
- **THEN** MUST 開一個新 group，MUST NOT 併進名稱最接近的既有 group

#### Scenario: 角色變更後即時反應

- **WHEN** 管理員修改使用者 roleId 後，使用者重新登入或 `useCurrentMember` 快取重整
- **THEN** Sidebar 依新 permissions / roleCode 重新計算可見項目與 group

#### Scenario: 點 footer 登出

- **WHEN** 使用者點 sidebar footer 的「登出」按鈕
- **THEN** 清掉 access / refresh token、清掉 TanStack Query cache、導向 `/login`
