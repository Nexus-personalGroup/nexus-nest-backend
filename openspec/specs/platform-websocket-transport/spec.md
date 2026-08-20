# platform-websocket-transport Specification

## Purpose

定義 WebSocket 連線層的工程契約：認證發生在什麼時機與失敗時的行為、在線狀態的一致性
與自我修復保證、跨實例送達的保證，以及 gateway 的職責邊界。

**不含任何聊天業務事件**——訊息、房間、已讀屬於各自的能力，本規格只保證
「一條已認證的連線可以加入群組並收到廣播」。

存在理由：這一層的失效方式**在單一實例內完全看不出來**。前一版專案的在線狀態存在
行程記憶體、也沒有跨實例廣播機制，功能看起來正常，開第二個實例後訊息才開始隨機消失。
把「跨實例送達」「實例死亡後自我修復」寫成可驗收的需求，是為了讓這些保證有東西守著，
而不是靠「目前只跑一個實例」這個暫時成立的前提。

驗收方式見 `openspec/project/testing.md` 的整合測試段落——本規格的需求
MUST 以兩個實際運行的實例驗證，單一實例內的行為不構成證據。

## Requirements
### Requirement: 連線必須先通過認證，且與 HTTP 走同一份解析邏輯

WebSocket 連線 SHALL 於 handshake 階段取得並驗證 access token，未通過者 MUST NOT 收送任何事件。

token 的解析與判定 MUST 呼叫與 HTTP 認證相同的 application service，MUST NOT 在 WS 層重寫一份。
兩條路徑允許不同的**取 token 方式**與**失敗表現形式**，但「這個 token 是否有效、對應哪個成員」
的判定 MUST 只有一個實作。

重寫一份的代價已有前例：舊專案的 WS 認證漏掉 `tokenVersion` 比對，導致帳號被強制登出後
既有的 WS 連線仍然有效，且沒有任何徵兆。

token MUST 由 handshake 的 `auth` 欄位或 `Authorization` header 取得，
MUST NOT 接受 query string——query 會出現在伺服器日誌與 Referer header 中。

#### Scenario: 未提供 token

- **WHEN** 連線的 handshake 不含 token
- **THEN** 伺服器送出認證失敗事件後主動斷線，該連線 MUST NOT 進入任何群組

#### Scenario: token 已被撤銷

- **WHEN** 使用者的 `tokenVersion` 已因改密碼或強制登出而遞增，客戶端仍持舊 token 連線
- **THEN** 連線被拒絕——與同一個 token 打 HTTP API 的結果一致

#### Scenario: 以 query string 夾帶 token

- **WHEN** 客戶端把 token 放在連線 URL 的 query
- **THEN** 伺服器 MUST NOT 採信，視同未提供

### Requirement: 在線狀態必須跨實例一致且不留殭屍

在線狀態 SHALL 存放於 Redis 而非行程記憶體，使任一實例都能查詢到完整的在線集合。

每筆連線紀錄 MUST 帶有最後心跳時間，且 MUST 能在其所屬實例**未執行正常斷線流程**的情況下
（行程被強制終止、容器被驅逐）自動失效。以「集合成員」形式儲存而不帶各自的時效
MUST 視為違反本需求——那會讓被 kill 的實例上的使用者永遠顯示為在線。

同一個成員 MAY 同時有多條連線（多裝置、多分頁）。**成員的在線與否取決於是否還有任一條
未逾時的連線**，而非最後一次斷線事件。

#### Scenario: 使用者開兩個分頁後關掉其中一個

- **WHEN** 其中一條連線正常斷線
- **THEN** 該成員 MUST 仍為在線——另一條連線還在

#### Scenario: 實例被強制終止

- **WHEN** 某實例未執行斷線清理即消失
- **THEN** 其上的連線紀錄在數個心跳週期內失效，該成員的在線狀態 MUST 恢復正確

#### Scenario: 以無時效的集合儲存連線

- **WHEN** 實作改用不帶時效資訊的集合結構
- **THEN** 違反本需求——實例非正常終止時無法自動恢復

### Requirement: 廣播必須跨實例送達

送往某個群組的事件 SHALL 送達該群組**所有實例上**的連線，而不只是發送者所在的實例。

本需求是整個 WebSocket 層的存在前提：不成立的話服務就只能單機執行，
所有水平擴展的討論都沒有意義。

驗收 MUST 以「兩個實例的實際連線」證明，MUST NOT 以單一實例內的行為推論。

#### Scenario: 跨實例廣播

- **WHEN** 連在實例 A 的成員送出一個群組事件，另一成員連在實例 B 且屬於同一群組
- **THEN** 實例 B 的連線收得到該事件

#### Scenario: 只驗證單一實例

- **WHEN** 測試只在一個實例內驗證廣播
- **THEN** 不構成本需求的驗收——單機內的廣播不經過跨實例路徑

### Requirement: 事件 payload 必須經 schema 驗證

所有由客戶端送入的事件 payload SHALL 以 Zod schema 驗證後才進入 application 層，
型別 MUST 由 schema 推導而非手寫。

WS payload 與 HTTP request body 同屬外部輸入，**沒有任何理由適用較寬鬆的標準**。

#### Scenario: payload 形狀不符

- **WHEN** 客戶端送出缺少必要欄位或型別錯誤的 payload
- **THEN** 該事件被拒絕並回覆錯誤，MUST NOT 進入 application 層

#### Scenario: 手寫 payload 型別

- **WHEN** 事件的型別以 interface 或 class 手寫而非由 schema 推導
- **THEN** 違反本需求——型別與驗證會各自演化而分歧

### Requirement: Gateway 只做轉譯，不得承載業務邏輯

Gateway SHALL 只負責：驗證 payload、呼叫 use case、把結果轉成回應。
業務規則、速率限制、狀態判斷 MUST 位於 application 層。

Gateway MUST NOT 直接相依持久層（Prisma 或 repository）。

舊專案的 gateway 長到 544 行、把業務邏輯與廣播混在一起，起因不是疏忽，
而是**當時沒有任何規則會擋下第一次違規**。

#### Scenario: gateway 直接查詢資料庫

- **WHEN** gateway 注入 Prisma 或 repository
- **THEN** 違反本需求，且 MUST 由架構守則在測試階段攔截

#### Scenario: 速率限制寫在 gateway

- **WHEN** 限流判斷直接寫在事件 handler 內
- **THEN** 違反本需求——它是業務規則，屬於 application 層

