# ui-user-management Specification

## Purpose

後台「前台會員」頁面的畫面行為：`/front-users` 列表與 `/front-users/:userId` 詳情。
API 契約見 `api-user-management` 與 `api-account-suspension`。

兩個貫穿全篇的決定：

- **與審閱側的成員概覽是兩頁，不合併**。本頁回答「這個帳號是什麼狀態」，
  那一頁回答「這個人在聊天裡做了什麼」，各自需要不同的權限。塞進同一頁會讓
  「這一區要哪個權限才看得到」變成頁面內部的隱藏規則。
- **動作與導覽的權限規則相反**：動作在沒有權限時 **disabled 並說明理由**
  （使用者需要知道「這件事做得到，只是不是由我做」），導覽則**直接隱藏**
  （點進去只會得到一個無權限畫面）。前者沿用 `ui-moderation` 的既有判準。
## Requirements
### Requirement: 前台使用者列表頁

`/front-users` SHALL 提供前台使用者的分頁清單，含 email／顯示名稱搜尋、
啟用狀態與信箱驗證狀態的過濾。

Sidebar 的入口 SHALL 放在「使用者與權限」群組，標籤為「前台會員」，
需 `BACKEND:FRONT_USER:VIEW` 才顯示。

**標籤不能只叫「會員」**：Sidebar 已經有一個 `/members`（後台帳號管理）叫「會員管理」，
兩個都叫會員會讓人點錯，而點錯的後果是在錯的體系裡找人然後以為對方不存在。

每一列 SHALL 顯示：email、顯示名稱、狀態、信箱是否已驗證、最後活動時間、註冊時間。
`avatarUrl` 以頭像顯示於列首；為 null 時顯示顯示名稱的第一個字元，MUST NOT 破版。

`lastSeenAt` SHALL 標示其語意為「最後登入」而非「最後上線」——
它目前只在登入與換發 token 時更新。用 tooltip 或欄位標題註明皆可，
但 MUST NOT 只寫「最後活動」讓人自行猜測。

搜尋與過濾 SHALL 反映在 URL query 上，讓結果可以直接分享與重新整理後保留。

#### Scenario: 沒有權限時看不到入口

- **WHEN** 登入者沒有 `BACKEND:FRONT_USER:VIEW`
- **THEN** Sidebar MUST NOT 出現「前台會員」，直接輸入網址 MUST 導向無權限畫面

#### Scenario: 空清單

- **WHEN** 查詢結果為 0 筆
- **THEN** 顯示空狀態文案，MUST NOT 顯示空的表格骨架或「載入中」

#### Scenario: 搜尋條件寫進 URL

- **WHEN** 使用者輸入 email 關鍵字並切到第 2 頁
- **THEN** URL 帶著該條件與頁碼；重新整理後畫面一致

#### Scenario: 沒有頭像

- **WHEN** 某使用者的 `avatarUrl` 為 null
- **THEN** 顯示顯示名稱首字的替代圖示，版面與有頭像時一致

### Requirement: 前台使用者詳情頁

`/front-users/:userId` SHALL 顯示單一前台使用者的帳號面資料，
並提供停權／解除與強制登出三個動作。

**本頁不顯示任何聊天內容或檢舉統計。** 那些屬於審閱側的成員概覽
（`/moderation/member-profile/:id`）。當登入者**同時**具備
`BACKEND:MODERATION:VIEW` 時，本頁 SHALL 顯示一個連往該頁的連結；
沒有該權限時該連結 MUST NOT 出現。

**兩頁不合併**：把兩份資料塞進同一頁，會讓「這一區要哪個權限才看得到」
變成頁面內部的隱藏規則，而權限差異在畫面上看不出來正是最容易出錯的地方。

三個動作的呈現 SHALL 依風險區分：

| 動作 | 二次確認 | 位置 |
| --- | --- | --- |
| 停權 | **需要**——使用者會立刻被登出且無法再登入 | 危險區塊，與其他動作分開 |
| 解除停權 | 需要 | 同上，與停權互斥顯示 |
| 強制登出 | **不需要**——可逆，對方重新登入即可 | 一般動作區 |

強制登出與停權 MUST NOT 並排放在一起：兩者的圖示與文案都相近，
並排時按錯的成本不對稱（停權是使用者感受得到的、強制登出不是）。

三個動作在缺 `BACKEND:FRONT_USER:EDIT` 時 MUST disabled 並以 tooltip 說明
「無處置權限」，**MUST NOT 隱藏**——沿用 `ui-moderation` 既有的判準：
隱藏會讓人以為功能不存在，然後去問「為什麼我不能停權」；
停用加上理由則當場回答了那個問題。

**動作與導覽的規則相反，這是刻意的**：導覽（Sidebar 項目、下方的「查看審閱紀錄」連結）
在沒有權限時**隱藏**，因為點進去只會得到一個無權限畫面；
而動作留在原地並說明原因，因為使用者需要知道「這件事做得到，只是不是由我做」。

#### Scenario: 只有檢視權限

- **WHEN** 登入者有 `BACKEND:FRONT_USER:VIEW` 但沒有 `EDIT`
- **THEN** 頁面正常顯示資料，三個動作 MUST disabled 並附上
  「無處置權限」的 tooltip，MUST NOT 隱藏

#### Scenario: 停權需要二次確認

- **WHEN** 點下停權
- **THEN** 跳出確認對話框並說明後果（立即登出、無法再登入）；取消則不送出請求

#### Scenario: 強制登出不需要二次確認

- **WHEN** 點下強制登出
- **THEN** 直接送出並顯示成功提示，說明「該使用者需重新登入，帳號仍可使用」

#### Scenario: 停權後畫面即時反映

- **WHEN** 停權成功
- **THEN** 狀態欄位變為停權中，動作切換為「解除停權」，MUST NOT 需要手動重新整理

#### Scenario: 同時具備審閱權限

- **WHEN** 登入者同時有 `BACKEND:MODERATION:VIEW`
- **THEN** 顯示「查看審閱紀錄」連結，導向該使用者的成員概覽頁

#### Scenario: 沒有審閱權限

- **WHEN** 登入者沒有 `BACKEND:MODERATION:VIEW`
- **THEN** 該連結 MUST NOT 出現

#### Scenario: 使用者不存在

- **WHEN** 網址帶的 `userId` 不存在
- **THEN** 顯示「找不到這個使用者」的空狀態，MUST NOT 顯示空白頁或無限載入

