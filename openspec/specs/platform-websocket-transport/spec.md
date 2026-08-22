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

**衍生索引是允許的，但真相 MUST 留在帶時效的連線紀錄上。** 為了讓某些查詢便宜，
MAY 額外維護由連線紀錄推導出來的索引（例如「目前在線的成員 ID 集合」）。
這類索引 MUST 滿足三件事：

- 任何**在線與否的判斷** MUST 讀連線紀錄，MUST NOT 讀索引——
  索引壞掉時系統只會給出錯的統計，不會給出錯的授權或狀態
- MUST 有週期性的校正機制，因為實例被強制終止時不會執行任何清理
- 校正 MUST NOT 有「索引短暫為空」的窗口（例如整份刪除後重建），
  那會讓讀取端看到一個看起來像故障的正確操作

上一段的存在是為了與「不得用無時效的集合儲存連線」區分開：
**被禁止的是把連線本身存成集合，不是為了統計而建的投影。**
少了這個區分，日後看到 presence 相關的 SET 會誤以為規則被打破。

#### Scenario: 使用者開兩個分頁後關掉其中一個

- **WHEN** 其中一條連線正常斷線
- **THEN** 該成員 MUST 仍為在線——另一條連線還在

#### Scenario: 實例被強制終止

- **WHEN** 某實例未執行斷線清理即消失
- **THEN** 其上的連線紀錄在數個心跳週期內失效，該成員的在線狀態 MUST 恢復正確

#### Scenario: 以無時效的集合儲存連線

- **WHEN** 實作改用不帶時效資訊的集合結構儲存**連線**
- **THEN** 違反本需求——實例非正常終止時無法自動恢復

#### Scenario: 衍生索引與連線紀錄不一致

- **WHEN** 索引顯示某成員在線，但其連線紀錄已全部逾時
- **THEN** `isOnline()` MUST 回報離線（讀的是連線紀錄），且該索引 MUST 在下一次校正時修正

#### Scenario: 索引的校正

- **WHEN** 週期性校正執行
- **THEN** MUST 以差集調整（增補與移除各自進行），MUST NOT 整份刪除後重建

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

### Requirement: 認證狀態變更必須能中止既有連線

當某成員的認證狀態改變（例如帳號被停用）時，系統 SHALL 主動中止該成員既有的
WebSocket 連線，MUST NOT 只依賴下一次認證。

連線層的認證只在 handshake 執行一次。之後的事件只驗資源層級的授權
（例如房間成員資格），不會重新解析身分——因此**帳號停用之後，
既有的連線仍然可以繼續操作**，直到它自己斷開為止。

這個缺口的形狀值得記住：**每一層都正確，但沒有人負責銜接**。
帳號停用做對了、WS 認證做對了、房間授權做對了，
只是沒有人規定「帳號狀態變了，既有連線怎麼辦」。

中止 MUST 跨實例生效：連線落在哪個實例是隨機的，只斷本實例的等於隨機失效。

#### Scenario: 帳號被停用

- **WHEN** 某成員的帳號狀態改為停用
- **THEN** 該成員的所有 WebSocket 連線被主動斷開，不論它們落在哪個實例

#### Scenario: 停用後嘗試重連

- **WHEN** 被停用的成員嘗試建立新連線
- **THEN** 在 handshake 就被拒絕——既有的認證路徑已經涵蓋這一段

#### Scenario: 只斷本實例

- **WHEN** 中止的實作只處理本行程持有的連線
- **THEN** 違反本需求——連線落在哪個實例是隨機的

### Requirement: 連線層必須有事件限流

系統 SHALL 限制**單一 WebSocket 連線**的事件速率，套用到所有 `@SubscribeMessage`
handler，MUST NOT 有例外清單。

HTTP 端有全域 throttle middleware，但連線建立後的每個事件都是同一條 TCP 連線上的
訊框——**不經過任何計次**。逐個 use case 接限流無法涵蓋這件事，
而且會給出「覆蓋完整」的錯覺：`ping` 這類看似無害的事件仍然完全不受限。

`ping` 也 MUST 計入。「無害」是就單次而言——每秒一萬個 ping 一樣會佔滿事件迴圈，
而這正是本需求要防的。例外清單會逐漸長大，**每多一個例外就多一條不受限的路徑**。

超過門檻時 SHALL 丟棄該事件並回錯，MUST NOT 斷開連線：
誤判的代價不對稱——網路拖慢造成的瞬間爆量會讓一個暫時性的異常變成
使用者可見的故障，而客戶端還會自動重連造成更多負載。

門檻 MUST 來自環境變數，且 SHOULD 設在遠高於任何合理客戶端的水準：
這條防線是「明顯失控」的界線，不是精細控制。

#### Scenario: 事件速率超過門檻

- **WHEN** 單一連線在時間窗內送出的事件數超過門檻
- **THEN** 該事件被丟棄並回錯，連線維持

#### Scenario: 心跳事件

- **WHEN** 連線送出 `ping`
- **THEN** 它同樣計入——沒有例外清單

#### Scenario: 兩條連線各自計數

- **WHEN** 同一成員開兩條連線
- **THEN** 兩者的額度互不影響——限流保護的是行程的事件迴圈，不是成員的行為

#### Scenario: 時間窗滑過後恢復

- **WHEN** 超過門檻的連線停止送事件，等過一個時間窗
- **THEN** 它可以繼續正常送出

### Requirement: 連線層限流不得取代業務層限流

連線層的事件限流 MUST NOT 被用來取代寫入型 use case 各自的限流。

兩者問的問題不同：連線層保護的是**這個行程的事件迴圈**，計數單位是單一連線；
送訊息的限流保護的是**房間不被洗版**，計數單位是「成員 + 房間」（跨連線、跨實例）。

**開 N 條連線就能繞過連線層的限流**，但業務層的不受影響。
移除業務層限流並宣稱「已經有連線層限流」是一個實際會發生的錯誤，
因此本需求明文禁止。

#### Scenario: 移除送訊息的限流

- **WHEN** 有人以「連線層已經有限流」為由移除送訊息的逐 use case 限流
- **THEN** 違反本需求——開多條連線即可繞過連線層的計數

#### Scenario: 兩者並存

- **WHEN** 一則訊息同時通過連線層與業務層的限流
- **THEN** 才被接受——兩道各自獨立

### Requirement: 在線人數的查詢成本不得隨在線人數成長

查詢「目前在線人數」SHALL 是常數成本的操作，MUST NOT 掃描 keyspace，
MUST NOT 對每個成員各發一次查詢。

掃描 presence key 的 pattern MUST 只在**週期性清理**中使用。
任何請求路徑（HTTP handler、SSE 推送、WS 事件）用到它 MUST 視為違反本需求。

理由不只是單次成本。這類查詢的性質是「**使用者越多越糟**」，
而它一旦掛在固定週期的推送上，成本就變成
「掃描成本 × 每秒次數 × 實例數」——三個因子都會成長，
且在服務最忙的時候同時放大。

架構守則 MUST 以「哪些方法可以使用掃描 pattern」的形式檢查，
判定 MUST 以方法為單位而非檔案為單位：presence 的 adapter 同時擁有清理與查詢兩種方法，
以檔案為單位會讓「查詢方法拿去掃描」這種錯直接漏掉。

#### Scenario: 儀表板查詢在線人數

- **WHEN** 營運總覽每個週期取一次在線人數
- **THEN** MUST 是單一常數成本的 Redis 操作

#### Scenario: 請求路徑使用掃描 pattern

- **WHEN** 某個非清理用途的方法呼叫掃描 pattern 的建構函式
- **THEN** 守則失敗，除非該方法列入 allowlist 並註明理由

#### Scenario: 守則以檔案為單位判定

- **WHEN** 守則只檢查「哪些檔案可以用掃描 pattern」
- **THEN** 違反本需求——同一個檔案裡的查詢方法會跟著清理方法一起被放行

#### Scenario: 在線人數用於統計以外的用途

- **WHEN** 有程式碼把在線人數用於授權、計費或任何需要精確值的判斷
- **THEN** 違反本需求的意圖——這個數字有校正延遲，精確的判斷 MUST 讀連線紀錄

