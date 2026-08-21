## Why

四個 change 的 Open Questions 都提到「保留期限未定」，而資料只會越積越多。
現在三張表全部無限保留：

- `chat_audit_logs`：每次加入／離開房間、被限流、撤回被拒、提出檢舉、查看檢舉都寫一筆。
  **只寫不讀**（除了調查），是成長最快的一張
- `chat_reports`：量小，但**含訊息內容快照**——那是個資
- `chat_messages`：核心產品資料

既有的 `LogRetentionScheduler` 已經解決了 `system_logs` / `auth_logs`，
而它留下的模式（分批 `ctid IN (...)`、失敗不讓排程掛掉）可以直接沿用。

## What Changes

- 新增 `ChatRetentionScheduler`：每日清理逾期的稽核紀錄與已判定的檢舉
- 保留天數進 `envSchema`：稽核預設 180 天、檢舉預設判定後 365 天
- **未判定（`PENDING`）的檢舉永不清理**——理由見 design.md D2
- **不清理訊息**——理由見 design.md D1，這是本 change 最重要的決定
- 沿用 `PurgeLogsPort` 的分批模式，不用 `deleteMany`

## Capabilities

### New Capabilities

- `platform-data-retention`：保留策略的契約

### Modified Capabilities

無。既有的日誌保留是 `platform-*` 底下的實作細節，沒有對應的 spec 需求要改。

## Impact

- **無資料庫 migration**——只新增排程與查詢
- **新增三個環境變數**（開關 + 兩個保留天數 + cron）
- **首次啟用時會刪除既有的逾期資料**，且不可逆。部署前值得先用
  `SELECT count(*) WHERE created_at < now() - interval '180 days'` 確認影響範圍
- 不改動任何 API 的行為
