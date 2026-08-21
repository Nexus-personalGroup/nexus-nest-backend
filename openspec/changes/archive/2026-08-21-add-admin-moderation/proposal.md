## Why

`add-chat-report` 讓檢舉進得來，但**沒有任何人看得到它們**。目前檢舉躺在資料庫裡，
`status` 永遠是 `PENDING`，沒有端點能查、也沒有東西能改變它。

同樣地，`add-chat-observability` 記錄了每個人的行為時間軸，
但除了直接連進資料庫，沒有辦法讀它。

這個 change 補上後台的**讀取與判定**：管理員看得到佇列、看得到當事人的行為時間軸、
能把檢舉標記為已處理或駁回。

**這也是本專案第一條「看得到被撤回內容」的路徑**——但它走的是檢舉的內容快照
（`chat_reports.contentSnapshot`），**不是** `chat_messages`。因此
`chat-message-single-entry` 守則**維持零豁免**，這個 change 不會動它。

即便如此，特權的代價照付：RBAC 授權，而且**查看這件事本身要留稽核**。
快照與訊息本體適用同一套「不外流」規則，差別只在它存在另一張表。

## What Changes

- 新增後台端點：檢舉佇列查詢、單筆檢舉詳情（含內容快照）、狀態流轉、成員行為時間軸
- 新增權限碼 `BACKEND:MODERATION:VIEW` 與 `BACKEND:MODERATION:EDIT`
- **狀態流轉只做 `PENDING → REVIEWED / DISMISSED`**，不含移除訊息或停權——理由見 design.md D1
- `ChatReportRecord` 新增 `reviewedAt` / `reviewedBy` / `reviewNote`
- **查看檢舉詳情會寫稽核**（`REPORT_VIEWED`）——那是特權路徑的對價
- 強化 `chat-message-single-entry` 的豁免檢查：**與調查相關的豁免，理由必須同時說明「僅限後台 / 需 RBAC / 查看留稽核」**。本 change 不新增任何豁免，這是為日後真的需要時預先立下標準

## Capabilities

### New Capabilities

- `api-moderation`：後台審閱的 REST 契約

### Modified Capabilities

- `platform-observability`：稽核動作新增「查看檢舉詳情」
- `platform-engineering-guardrails`：訊息表單一入口守則新增豁免的條件要求（本 change 不使用它）

## Impact

- **資料庫 migration**：`chat_reports` 加三個可空欄位；新增兩筆權限碼的 seed
- **新增後台端點**：走 `gen:module --admin` 產生器，swagger 與 api-client 一併更新
- **既有的 SUPERADMIN 不會自動獲得新權限**——需要在後台指派，或由 seed 補
- 不改動任何前台 API 的行為
- 無新環境變數
