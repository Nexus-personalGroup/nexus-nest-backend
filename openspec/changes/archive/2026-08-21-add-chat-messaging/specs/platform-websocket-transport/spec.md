## MODIFIED Requirements

### Requirement: Gateway 只做轉譯，不得承載業務邏輯

Gateway SHALL 只負責：驗證 payload、呼叫 use case、把結果轉成回應。
業務規則、速率限制、狀態判斷 MUST 位於 application 層。

Gateway MUST NOT 直接相依持久層（Prisma 或 repository）。

**資源存取的授權判斷屬於業務規則**，因此也不得寫在 gateway：gateway 呼叫 use case
取得許可，取得後才執行 socket 操作（`join` / `leave` / `emit`）。
socket 操作本身是傳輸細節，反過來也不該下沉到 application 層——
那會讓 application 相依 Socket.IO。

**回應 MUST 反映已經發生的事實。** gateway MUST NOT 在 use case 完成前先送出成功回應：
樂觀回覆在寫入失敗時會讓使用者看到一則實際不存在的訊息，而且沒有回頭修正的機會
——客戶端已經把它畫在畫面上了。

舊專案的 gateway 長到 544 行、把業務邏輯與廣播混在一起，起因不是疏忽，
而是**當時沒有任何規則會擋下第一次違規**。

#### Scenario: gateway 直接查詢資料庫

- **WHEN** gateway 注入 Prisma 或 repository
- **THEN** 違反本需求，且 MUST 由架構守則在測試階段攔截

#### Scenario: 速率限制寫在 gateway

- **WHEN** 限流判斷直接寫在事件 handler 內
- **THEN** 違反本需求——它是業務規則，屬於 application 層

#### Scenario: 憑客戶端提供的識別碼直接操作 socket

- **WHEN** handler 收到 `roomId` 後未經 application 層判斷即 `client.join()`
- **THEN** 違反本需求——那等於任何已認證使用者都能加入任意房間並收到其全部廣播

#### Scenario: 在寫入完成前先回 ack

- **WHEN** handler 先送出成功回應，再（或並行地）呼叫寫入的 use case
- **THEN** 違反本需求——寫入失敗時使用者會看到一則不存在的訊息
