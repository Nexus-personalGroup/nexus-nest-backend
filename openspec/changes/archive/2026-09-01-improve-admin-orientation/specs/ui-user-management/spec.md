## MODIFIED Requirements

### Requirement: 前台使用者列表頁

`/front-users` SHALL 提供前台使用者的分頁清單，含 email／顯示名稱搜尋、
啟用狀態與信箱驗證狀態的過濾。

Sidebar 的入口 SHALL 放在**「會員管理」群組**，標籤為「會員列表」，
需 `BACKEND:FRONT_USER:VIEW` 才顯示。

**區別由群組承擔，不由標籤前綴承擔。** 先前兩個帳號體系同處「使用者與權限」群組，
靠「會員管理」（後台帳號）與「前台會員」（前台使用者）的前綴區分——
兩個標籤都以「會員」結尾，掃過去要停下來讀完才分得出來，
而**靠讀者仔細讀標籤的設計遲早會被讀錯**。後台帳號的入口因此搬到
「管理者與權限」群組並改稱「管理者帳號」，兩者不再同組。

每一列 SHALL 顯示：email、顯示名稱、狀態、信箱是否已驗證、最後活動時間、註冊時間。
`avatarUrl` 以頭像顯示於列首；為 null 時顯示顯示名稱的第一個字元，MUST NOT 破版。

`lastSeenAt` SHALL 標示其語意為「最後登入」而非「最後上線」——
它目前只在登入與換發 token 時更新。用 tooltip 或欄位標題註明皆可，
但 MUST NOT 只寫「最後活動」讓人自行猜測。

搜尋與過濾 SHALL 反映在 URL query 上，讓結果可以直接分享與重新整理後保留。

#### Scenario: 沒有權限時看不到入口

- **WHEN** 登入者沒有 `BACKEND:FRONT_USER:VIEW`
- **THEN** Sidebar MUST NOT 出現「會員列表」，直接輸入網址 MUST 導向無權限畫面

#### Scenario: ⭐ 與後台帳號分屬不同群組

- **WHEN** 登入者同時看得到兩個帳號體系的入口
- **THEN** 它們 MUST 位於不同的 sidebar group，MUST NOT 只靠標籤前綴區分

#### Scenario: 空清單

- **WHEN** 查詢結果為 0 筆
- **THEN** 顯示空狀態文案，MUST NOT 顯示空的表格骨架或「載入中」

#### Scenario: 搜尋條件寫進 URL

- **WHEN** 使用者輸入 email 關鍵字並切到第 2 頁
- **THEN** URL 帶著該條件與頁碼；重新整理後畫面一致

#### Scenario: 沒有頭像

- **WHEN** 某使用者的 `avatarUrl` 為 null
- **THEN** 顯示顯示名稱首字的替代圖示，版面與有頭像時一致
