## ADDED Requirements

### Requirement: 聊天行為稽核只記錄無法回溯的行為

系統 SHALL 為「證據會隨著資料變動而消失」的聊天行為留下稽核紀錄，
MUST NOT 為已有既存紀錄的行為（例如送出訊息）另外寫一筆。

判準是「這件事發生過的證據會不會消失」，不是「這件事重不重要」。
送出訊息已經記在 `chat_messages`（發送者、房間、時間、序號），
再寫一筆稽核只是把同一份中繼資料存兩次，代價是熱路徑多一次寫入與儲存翻倍。

MUST 稽核的行為至少包含：加入房間、離開房間、撤回成功、撤回被拒、被限流擋下。
離開房間尤其關鍵——成員關係列會被直接刪除，
因此「某人曾在某房間待到某時」目前完全不可復原。

稽核紀錄 MUST NOT 包含訊息內容。內容已存在於 `chat_messages`（撤回也保留），
複製一份等於多一條洩漏路徑，而且兩份內容的遮蔽規則必須同步維護。

#### Scenario: 成員離開房間

- **WHEN** 某成員離開房間，成員關係列被刪除
- **THEN** 留下一筆稽核紀錄，包含成員、房間、時間

#### Scenario: 送出訊息

- **WHEN** 成員成功送出一則訊息
- **THEN** MUST NOT 寫入稽核紀錄——`chat_messages` 已是它自己的紀錄

#### Scenario: 被限流擋下

- **WHEN** 送訊息因超過限流而被拒
- **THEN** 留下稽核紀錄——這是洗版行為的唯一證據

#### Scenario: 稽核紀錄不含內容

- **WHEN** 任何稽核紀錄被寫入
- **THEN** 其欄位中 MUST NOT 出現訊息內容

### Requirement: 稽核寫入失敗不得影響業務動作

稽核寫入 SHALL 為 best-effort：失敗時 MUST NOT 讓觸發它的業務動作失敗，
且 MUST 以 error 等級記錄。

稽核表滿了或寫入逾時，不該讓使用者送不出訊息或離不開房間。

但**失敗必須看得見**：MUST NOT 使用 fire-and-forget（未處理的 Promise 會變成
unhandled rejection，且失敗完全無聲）。立場是「盡力而為，但失敗要留下痕跡」。

#### Scenario: 稽核寫入拋錯

- **WHEN** 稽核 port 的寫入失敗
- **THEN** 業務動作照常完成，錯誤以 error 等級記錄

#### Scenario: 稽核關閉

- **WHEN** 稽核開關關閉
- **THEN** 不寫入任何紀錄，業務動作不受影響

### Requirement: 指標經 port 呼叫，application 層不得相依監控套件

業務服務 SHALL 透過 `MetricsPort` 回報指標，MUST NOT 直接 import `prom-client`
或其 NestJS 包裝。

服務要能說「訊息送出了」，但不該知道那是 counter 還是 histogram——
換掉監控實作時不該動到任何業務程式碼。

指標的標籤 MUST NOT 使用無界的值（例如房間 ID）。
標籤基數爆炸是監控系統最典型的自傷方式。

#### Scenario: service 直接使用 prom-client

- **WHEN** application 層的檔案 import `prom-client`
- **THEN** 違反本需求，MUST 由架構守則在測試階段攔截

#### Scenario: 以房間 ID 作為標籤

- **WHEN** 指標以房間 ID 為標籤
- **THEN** 違反本需求——房間數無界，時間序列會無限增長

### Requirement: 指標與稽核必須各自獨立開關

指標與稽核 SHALL 由各自的環境變數控制，MUST NOT 共用同一個開關。

兩者的失效模式不同：指標關掉只是看不到趨勢，稽核關掉會讓日後的調查沒有依據。
共用開關會讓「暫時關掉指標降低負載」這個合理操作順手把稽核也關了，
而那要等到真的需要調查時才會發現。

#### Scenario: 關閉指標

- **WHEN** 指標開關關閉、稽核開關開啟
- **THEN** 不曝露自訂指標，但稽核照常寫入
