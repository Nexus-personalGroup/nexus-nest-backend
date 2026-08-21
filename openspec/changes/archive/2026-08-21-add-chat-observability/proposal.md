## Why

聊天功能完整了，但**現在完全看不見它在做什麼**。Prometheus 已經掛載，卻只有
Node/process 的預設指標；`SystemLogRecord` 只記 HTTP 請求，WebSocket 的事件
一條都不會留下。

兩件事無法回溯補齊，因此不能晚做：

- **指標**。沒有埋點就永遠不知道上週的連線峰值是多少、訊息寫入延遲有沒有變差。
  這類資料只能從「現在開始記」，事後補不回來。
- **行為稽核**。M3 的目標是檢舉驅動的調查，而調查要回答的是
  「這個人在被檢舉前做了什麼」。目前有一整類行為**完全沒有留下痕跡**：
  離開房間會直接刪除成員關係列（刻意不做軟刪除），因此
  「X 曾經在 Y 房間待到某時」是不可復原的；被限流擋下、撤回被拒，也都毫無紀錄。

**訊息本身不需要另外稽核**——`chat_messages` 已經記了發送者、房間、時間，
撤回也保留內容。再複製一份中繼資料到稽核表是純粹的重複。稽核要補的是
**那些不會自己留下紀錄的行為**。

## What Changes

- 新增 `ChatAuditLogRecord`：只記中繼資料（誰、何時、哪個房間、做了什麼、對象是誰），
  **不快照訊息內容**——內容已在 `chat_messages`，複製一份等於多一條洩漏路徑
- 稽核事件限於**無法從既有資料回溯的行為**：加入／離開房間、撤回、被限流擋下、
  撤回被拒。發送訊息本身不記
- 新增 `MetricsPort` 與 Prometheus 實作：連線數、訊息量、寫入延遲、限流觸發、WS 事件成敗
- 埋點經 port 呼叫，**application 層不得直接相依 `prom-client`**
- 新增守則：稽核寫入失敗 MUST NOT 讓業務動作失敗

## Capabilities

### New Capabilities

- `platform-observability`：指標與行為稽核的契約

### Modified Capabilities

- `platform-engineering-guardrails`：新增「稽核寫入不得影響業務動作」守則

## Impact

- **資料庫 migration**：新增一張表；不改動既有表
- **新增環境變數**：稽核開關（沿用既有的 `APPLICATION_METRICS_ENABLED` 控制指標）
- `/api/metrics` 新增自訂指標，既有的 Node/process 指標不變
- 不改動任何既有 API 的行為與回應格式
