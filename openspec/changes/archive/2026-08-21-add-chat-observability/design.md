## Context

現況：Prometheus 已掛載（`APPLICATION_METRICS_ENABLED` 控制）但只有 Node/process
預設指標，**零自訂埋點**；`SystemLogRecord` 只記 HTTP，WebSocket 完全不留痕跡。

範圍是使用者選定的：**指標 + 行為稽核（只記中繼資料）**。
檢舉入口與後台查詢端點留在 `tasks/todo.md`。

## Decisions

### D1：稽核只記「不會自己留下紀錄」的行為，不記每則訊息

這是本 change 最重要的決定，也是最容易做反的。

「每個動作都寫一筆稽核」聽起來完整，但對訊息而言是**純粹的重複**——
`chat_messages` 已經記了發送者、房間、時間、序號，撤回還保留了內容。
再寫一筆「某人在某時於某房間發了訊息 X」只是把同一份中繼資料存兩次，
代價是熱路徑上多一次寫入、儲存翻倍。

真正沒有紀錄的是這些：

| 行為 | 現在留下什麼 | 為什麼要稽核 |
| --- | --- | --- |
| 離開房間 | **什麼都沒有**——成員關係列被直接刪除（刻意不做軟刪除） | 「X 曾經在 Y 房間待到某時」目前不可復原 |
| 加入房間 | `joinedAt`，但離開時一併被刪 | 同上 |
| 被限流擋下 | 什麼都沒有 | 洗版行為的唯一證據 |
| 撤回被拒（逾時／非本人） | 什麼都沒有 | 「嘗試撤回別人的訊息」是可疑訊號 |
| 撤回成功 | `retractedAt` / `retractedBy` | 已有，但稽核表提供統一的時間軸查詢 |

**判準是「這件事發生過的證據會不會消失」**，不是「這件事重不重要」。

### D2：稽核寫入是 best-effort，失敗不得讓業務動作失敗

稽核表滿了、寫入逾時，都不該讓使用者送不出訊息或離不開房間。
因此呼叫端一律 `catch` 並以 **error 等級**記錄。

**不是 fire-and-forget**：未處理的 Promise 在 Node 會變成
unhandled rejection，而且失敗會完全無聲。這裡的立場是
**盡力而為、但失敗要看得見**——記到 logger（會進 Sentry），
而不是假裝沒發生。

這條有守則守著：稽核 port 的呼叫必須被 `catch`，否則守則失敗。
沒有它的話，日後有人寫成 `await this.audit.record(...)` 而不接錯誤，
稽核表一出問題整個聊天就掛掉，而測試不會有任何徵兆。

### D3：指標經 `MetricsPort`，application 層不碰 `prom-client`

業務服務要能說「訊息送出了」「這次被限流擋下」，但不該知道那是 counter 還是 histogram。
`MetricsPort` 放 application 的 out port，Prometheus 實作在 `adapter/out`。

指標清單（刻意精簡，寧可少而準）：

| 指標 | 型別 | 為什麼要它 |
| --- | --- | --- |
| `chat_ws_connections` | Gauge | 目前連線數。Prometheus 依 scrape target 自動帶實例標籤，**不要自己加 instanceId**，否則同一實例重啟會產生新的時間序列 |
| `chat_messages_total` | Counter | 訊息量；配合 rate() 看流量趨勢 |
| `chat_message_write_seconds` | Histogram | 寫入延遲。**這是配號序列化的可觀測性**——同一房間的寫入被鎖序列化是刻意的設計，但熱門房間會不會因此排隊，只能靠這個指標看出來 |
| `chat_rate_limited_total` | Counter | 限流觸發次數 |
| `chat_ws_events_total{event,outcome}` | Counter | 事件量與成敗，`outcome` 為 `success` / `error` |

**不做的**：每個房間一組指標。房間數是無界的，標籤基數爆炸會拖垮 Prometheus
——那是監控系統最典型的自傷方式。

### D4：稽核事件的種類是封閉聯集，不是任意字串

`ChatAuditAction` 是聯集型別（`'ROOM_JOINED' | 'ROOM_LEFT' | …`），DB 用 enum。
用字串的話，typo 會產生一個沒有人發現的新類別，而查詢時只會少一筆——
沒有錯誤、沒有徵兆。

### D5：稽核與指標各自獨立開關

指標沿用既有的 `APPLICATION_METRICS_ENABLED`；稽核用新的
`CHAT_AUDIT_ENABLED`（預設開啟）。

兩者的失效模式不同：指標關掉只是看不到趨勢，稽核關掉會讓調查沒有依據。
綁在同一個開關上，會讓「暫時關掉指標降低負載」這個合理操作
順手把稽核也關了，而那要等到真的需要調查時才會發現。

## Open Questions

- **稽核紀錄的保留期限**：目前無限增長。與 `add-chat-messaging` 的訊息保留策略
  是同一個決定，應與檢舉功能一起想清楚。既有的 `PurgeLogsService` 有現成的
  分批清理模式可以沿用。
- **指標是否要包含房間層級的分布**（例如「最活躍的 10 個房間」）：
  那不是指標該做的事，屬於後台查詢（M4）。

## 為檢舉功能預留了什麼

稽核表的欄位設計就是為了回答「這個人在被檢舉前做了什麼」：
以 `memberId` + 時間區間查詢，就能還原一條行為時間軸。

`targetMemberId`（對象）與 `targetMessageId` 兩個欄位讓「對誰做的」查得出來——
檢舉通常是「A 檢舉 B」，而調查要看的是 B 對 A 做過什麼。
現在不做檢舉，但沒有這兩個欄位的話，之後要補就得回填歷史資料，而那補不回來。

## 實作過程中的修正

### 「稽核關閉」改用單元測試驗，不用 e2e

tasks.md 原本寫「e2e：稽核關閉時不寫入」。實作時發現做不到——`getEnv()` 內部有
`_env` 快取，第一次解析後就固定了，執行期改 `process.env` 完全不生效。

**那對設定是正確的行為**（環境變數不該在執行期變動），錯的是我的測試策略，
以及我在 adapter 裡寫的那句註解「開關每次讀取，這樣測試覆寫才有效」——它是錯的。
註解已修正，開關的行為改由 `PrismaChatAuditRepository.spec.ts` 以 mock `getEnv` 驗證。

### 新增 `JoinRoomUseCase`，不在 gateway 直接呼叫稽核

原本規劃「加入房間（WS handler 成功後）」記稽核。但 gateway 不得觸發資料庫寫入
（既有的分層守則），而 `EnsureRoomMembershipUseCase` 是**唯讀判斷**、送訊息與補齊
都會呼叫它——在那裡記稽核等於每則訊息都寫一筆，正好違反 D1。

因此抽出 `JoinRoomUseCase`：先取得許可（沒有資格的人不該留下「加入了」的紀錄），
再記稽核。gateway 改呼叫它，不再直接使用 `EnsureRoomMembership`。
