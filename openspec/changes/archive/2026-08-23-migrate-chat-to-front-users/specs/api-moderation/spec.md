## ADDED Requirements

### Requirement: 審閱看到的當事人是前台使用者

所有審閱端點回傳的 email、顯示名稱與成員概覽 SHALL 來自 `users`（前台使用者），
MUST NOT 來自 `members`。

涵蓋的端點：檢舉佇列與詳情的 `reporterEmail` / `targetMemberEmail`、
成員概覽、成員相關檢舉的 `counterpartEmail`、房間詳情的成員清單、
以及營運總覽的成員數。

聊天裡的每一個參與者都是前台使用者，因此「這個 ID 屬於哪張表」在審閱的範圍內
只有一個答案。查 `members` 的結果會是一律 `null`——**一個看起來像
「所有帳號都被刪除了」的錯誤**，而不是一個會拋例外的錯。

#### Scenario: 檢舉佇列的當事人

- **WHEN** 管理員瀏覽檢舉佇列
- **THEN** `reporterEmail` 與 `targetMemberEmail` 來自 `users`

#### Scenario: 成員概覽

- **WHEN** 管理員查詢某個被檢舉者的概覽
- **THEN** 回傳的是該**前台使用者**的資料

#### Scenario: 傳入後台管理員的 ID

- **WHEN** 概覽端點收到一個 `members` 的 ID
- **THEN** 回 `404`——兩個身分空間不相交

#### Scenario: 營運總覽的成員數

- **WHEN** 儀表板顯示成員數
- **THEN** 計的是前台使用者數，MUST NOT 計後台管理員

### Requirement: 稽核紀錄的執行者與對象可能屬於不同的身分空間

`chat_audit_logs` 的兩個 ID 欄位 SHALL 有明確的歸屬規則：

| 欄位 | 語意 | 可能的身分 |
| --- | --- | --- |
| `member_id` | **做這件事的人** | 前台使用者（撤回訊息）**或**管理員（查看檢舉、移除訊息、停權） |
| `target_member_id` | **被做的人** | 一律是前台使用者 |

因此成員時間軸（`GET /moderation/members/:id/timeline`）查的是
「這個前台使用者**做過**什麼」，而管理員對他做的事出現在 `target_member_id` 那一側——
兩者的語意在切換後仍然正確。

**任何要顯示 `member_id` 對應之 email 的功能 MUST 先解決「這個 ID 屬於哪張表」。**
目前時間軸不顯示執行者，所以沒有這個問題；日後要顯示時，
拿管理員的 ID 去 `users` 查會得到 `null`，而那會被誤讀成「執行者的帳號被刪了」。

#### Scenario: 前台使用者撤回訊息的稽核

- **WHEN** 前台使用者撤回自己的訊息
- **THEN** `member_id` 是該使用者，出現在他自己的時間軸上

#### Scenario: 管理員移除訊息的稽核

- **WHEN** 管理員移除某則訊息
- **THEN** `member_id` 是**管理員**，`target_member_id` 是訊息的發送者（前台使用者）

#### Scenario: 時間軸的查詢對象

- **WHEN** 查詢某前台使用者的時間軸
- **THEN** 回傳 `member_id` 為該使用者的紀錄——即「他做過什麼」，
  而非「別人對他做過什麼」
