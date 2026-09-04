## ADDED Requirements

### Requirement: 前端的權限碼必須對得上後端目錄

`apps/web/` 宣告的每一個權限碼 MUST 存在於後端的權限目錄
（`shared/constants/permissions.ts` 的 `PERMISSION_CATALOG`），檢查 MUST 在既有的測試路徑上執行。

**打錯一個字的後果是靜默的**：`BACKEND:ACCOUNT:VEIW` 會讓那個 sidebar 項目對
**所有人**消失——包含 SUPERADMIN——而 typecheck、lint、測試全綠。
回報進來時的症狀是「選單不見了」，而那句話指不到任何地方。

前端 MUST 以型別化常數宣告權限碼，MUST NOT 使用裸字串。
**型別才是真正消滅打錯的那一道**，本規則是第二道：
它擋的是「常數本身就寫錯」與「後端把碼改名或移除」。

路由與 sidebar 對**同一個 path** 宣告的權限碼 MUST 一致——
兩邊不一致代表使用者看得到卻進不去，或反過來。

⚠️ **本規則涵蓋不到明細路由**（`/xxx/:id` 這類不在 sidebar 宣告裡的），
它們漏掛守衛時不會被抓到。**這個限制必須寫在案上**，
否則下一個人會以為守則涵蓋全部路由。

檢查 MUST 斷言掃描範圍有效：讀不到權限碼常數或讀不到後端目錄時 MUST 失敗，
否則規則會空轉成「全部通過」。

#### Scenario: ⭐ 前端權限碼在後端不存在

- **WHEN** `apps/web/` 宣告了一個後端目錄裡沒有的權限碼
- **THEN** 檢查失敗並指出該碼

#### Scenario: 路由與 sidebar 對同一 path 宣告不同權限

- **WHEN** 某 path 在 sidebar 宣告 `A`、在路由守衛宣告 `B`
- **THEN** 檢查失敗——兩邊必須一致

#### Scenario: 掃描範圍失效

- **WHEN** 檔案改名或結構改變導致讀不到權限碼常數
- **THEN** 檢查 MUST 失敗而非默默通過
