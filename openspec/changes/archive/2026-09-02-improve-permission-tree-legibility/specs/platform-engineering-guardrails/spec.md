## ADDED Requirements

### Requirement: 權限模組的中文對照必須齊全

系統 SHALL 確保 `PERMISSION_CATALOG` 出現的每個 platform 與 module，
在前端的中文對照表裡都有對應值。

對照表放在前端是刻意的取捨（不擴充 API 回應契約），代價是同一份分類法存在兩處。
漂移的形式很具體：**新增一個權限碼但忘了加中文，群組標題就退回英文碼片段**
——而畫面不會壞、不會報錯，只會有一張卡片長得跟別人不一樣。

檢查 MUST 同時確認「掃描範圍有效」（確實從兩邊各讀到了非空的集合），
掃不到就失敗——掃不到東西的規則等於不存在。

#### Scenario: 新增權限碼但沒加中文

- **WHEN** `PERMISSION_CATALOG` 新增一個 module 而前端對照表沒有它
- **THEN** 檢查失敗，訊息列出缺少對照的 module 與該加在哪個檔案

#### Scenario: 對照表有多餘項目

- **WHEN** 對照表含有 `PERMISSION_CATALOG` 已不存在的 module
- **THEN** 檢查失敗——那是權限碼移除後留下的死字串

### Requirement: 不可指派清單必須與後端守衛一致

系統 SHALL 確保 `SecurityController` 仍以 `@Roles(RoleCode.SUPERADMIN)` 保護。

前端的權限樹寫死了一個「限超級管理者、不可指派」的區塊來描述安全管理。
那段說明的正確性完全依賴後端沒有改用 `PermissionsGuard`——
**一旦改了，前端仍會顯示「不可指派」，而實際上它已經可以指派了**，
於是畫面在對使用者說謊，且沒有任何測試會失敗。

檢查刻意**只驗守衛、不比對條目內容**：比對「IP 白名單 / IP 黑名單 / 帳號解鎖」
這三個字串需要第三份端點與中文名的對照，而它擋下的只是文案不精確。

#### Scenario: 安全管理改用權限碼

- **WHEN** `SecurityController` 的 `@Roles(RoleCode.SUPERADMIN)` 被移除或改成 `@Permissions`
- **THEN** 檢查失敗，訊息說明前端權限樹有一段寫死的說明需要同步移除

#### Scenario: 掃描範圍失效

- **WHEN** controller 改名或搬移，導致檢查讀不到該檔
- **THEN** 檢查 MUST 失敗而非默默通過
