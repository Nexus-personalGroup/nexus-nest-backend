## MODIFIED Requirements

### Requirement: 不可指派的權限必須可見

權限樹 SHALL 顯示「後台存在、但無法透過角色指派」的功能，並說明原因。

目前唯一的這類功能是安全管理（IP 白名單 / IP 黑名單 / 帳號解鎖）——
它由 `@Roles(SUPERADMIN)` 保護而非權限碼，因此不會出現在
`GET /api/roles/permissions` 的回應裡。

- 這些項目 **MUST NOT 以 checkbox 呈現**，MUST 以純說明列表呈現，
  MUST 標示「限超級管理者」，並 MUST 以 tooltip 說明理由
  （能改 IP 名單等同能繞過所有 IP 層防護）。
- 該區塊 **MUST NOT 暗示任何授予狀態**——不論檢視或編輯哪一個角色，
  顯示的內容都必須成立。
- 它們 MUST NOT 進入表單的 `permissionCodes`。
- 清單來源為前端常數（後端沒有對應的權限碼可回傳），因此
  MUST 有自動化檢查確認後端的守衛未改變（見 `platform-engineering-guardrails`）。

**為什麼不能用 checkbox**（此條反轉了上一版的規定，理由留在這裡）：
一個恆為未勾的 disabled checkbox 對**超級管理者**是假的——那個角色恰恰做得到
這三件事。而若改成「SUPERADMIN 時顯示已勾」，同一張表上仍會有兩種未勾：
一般項目的未勾是「還沒給，你可以給」，這一區的未勾是「不由角色決定，永遠給不了」。
**同一個圖示兩種語意，使用者只能猜**。不用 checkbox 就沒有狀態要表達，
也就沒有東西會錯。

**缺席才是問題所在**：不顯示的話，使用者看到後台有 IP 白名單頁、
權限設定裡卻找不到它，會合理地判斷成「權限漏設了」而去找人回報。
顯示成不可指派則當場回答了那個問題。

#### Scenario: ⭐ 安全管理出現在權限樹上

- **WHEN** 開啟角色的新增或編輯 dialog
- **THEN** 權限樹含一個「安全管理」區塊，列出三項並標示「限超級管理者」

#### Scenario: ⭐ 該區塊不含任何 checkbox

- **WHEN** 檢視安全管理區塊
- **THEN** 其中 MUST NOT 出現任何 checkbox——
  沒有 checkbox 就不可能被點、不可能有值進 `permissionCodes`

#### Scenario: ⭐ 嘗試指派不可指派的項目

- **WHEN** 使用者想把安全管理的任一項指派給角色
- **THEN** 畫面上沒有任何可操作的控制項可以這麼做，
  表單的 `permissionCodes` 不包含任何安全管理相關的值。
  （上一版的做法是「點了 disabled 的 checkbox 但狀態不變」——
  同一個場景保留同一個名字，是為了讓做法的改變在 diff 裡看得見。）

#### Scenario: ⭐ 檢視超級管理者

- **WHEN** 開啟超級管理者角色的唯讀檢視
- **THEN** 安全管理區塊顯示的內容 MUST 成立——
  MUST NOT 出現任何暗示「此角色不具備這些功能」的呈現

#### Scenario: 說明為什麼不可指派

- **WHEN** 使用者 hover 安全管理的任一項
- **THEN** tooltip 說明該功能限超級管理者，而非只顯示「無權限」
