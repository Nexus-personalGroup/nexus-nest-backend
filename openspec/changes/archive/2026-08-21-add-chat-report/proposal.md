## Why

`add-chat-observability` 埋好了稽核，但**那些資料目前沒有任何消費者**——
沒有人會去翻 `chat_audit_logs`，因為沒有東西告訴他該翻誰。

檢舉就是那個觸發點：使用者說「這則有問題」，調查才有起點。
在此之前，即使系統完整記錄了每個人的行為時間軸，也沒有人知道該看哪一條。

這也是 Phase 1 目前唯一缺少的「使用者能對不當內容做點什麼」的入口。
沒有它，遇到騷擾的使用者只能離開房間——而離開之後連證據都看不到了。

## What Changes

- 新增 `ChatReportRecord`：檢舉人、被檢舉訊息、理由分類、補充說明、狀態
- **只能檢舉訊息**，不能直接檢舉使用者或房間——理由見 design.md D1
- **同一人對同一則訊息只能檢舉一次**：`(reporterId, targetMessageId)` 唯一索引，
  重複送出回傳既有那筆（冪等）
- 檢舉人必須是該房間成員：不能檢舉自己看不到的訊息
- **被檢舉者完全不知情**：沒有任何端點或推播會洩漏「你被檢舉了」
- 檢舉時**快照被檢舉訊息的內容**——這是唯一的例外，理由見 design.md D3
- 新增 `REPORT_SUBMITTED` 稽核動作

## Capabilities

### New Capabilities

- `api-front-chat-report`：檢舉的 REST 契約

### Modified Capabilities

- `platform-observability`：稽核動作新增「提出檢舉」

## Impact

- **資料庫 migration**：新增一張表；不改動既有表
- **新增 REST 端點**：`POST /api/front/chat-reports`
- 不改動任何既有 API 的行為與回應格式
- 無新環境變數
- **後台的檢舉佇列查詢不在本 change**（`add-admin-moderation`）——
  這個 change 只做「進得來」，處理流程是下一個
