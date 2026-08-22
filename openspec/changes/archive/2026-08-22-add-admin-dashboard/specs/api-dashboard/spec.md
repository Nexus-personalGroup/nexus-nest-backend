## ADDED Requirements

### Requirement: 查詢營運快照

`GET /api/admin/moderation/dashboard` SHALL 回傳一組營運數字的快照，
需 `BACKEND:MODERATION:VIEW` 權限。

回應 MUST 包含五個數字：`onlineMembers`（目前線上人數）、
`pendingReports`（待處理檢舉數）、`totalRooms`（房間數）、
`totalMembers`（成員數，不含已軟刪除）、`messagesToday`（今日訊息數）。

`generatedAt` MUST 一併回傳，讓呼叫端能顯示「最後更新於」——
一組沒有時間戳的即時數字，在連線中斷後看起來與即時數字一模一樣。

`messagesToday` 的日界 MUST 依 `APP_TIMEZONE` 判定，MUST NOT 使用 UTC 日界：
營運看的是「今天」，而伺服器的 UTC 午夜對台灣時間是早上八點。

本端點 MUST NOT 寫入稽核：回應只有聚合數字，不含任何個人或訊息內容。

回應 MUST NOT 包含任何訊息內容、成員 email 或房間名稱——
儀表板回答的是「現在怎麼樣」，任何具體的識別資訊都應該去對應的列表頁看。

**Request**：無

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "onlineMembers": 12,
    "pendingReports": 3,
    "totalRooms": 48,
    "totalMembers": 156,
    "messagesToday": 1204,
    "generatedAt": "2026-08-22T06:00:00.000Z"
  },
  "timestamp": "2026-08-22T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:VIEW` 權限

#### Scenario: 取得快照

- **WHEN** 有權限的管理員呼叫
- **THEN** 回傳五個數字與 `generatedAt`

#### Scenario: 今日訊息數依 APP_TIMEZONE 計算

- **WHEN** 某則訊息落在 UTC 的昨天但在 `APP_TIMEZONE` 的今天
- **THEN** 該則 MUST 計入 `messagesToday`

#### Scenario: 系統中沒有任何資料

- **WHEN** 資料庫是空的
- **THEN** 所有數字為 `0`，不視為錯誤

#### Scenario: 快照不含識別資訊

- **WHEN** 任何情況下呼叫本端點
- **THEN** 回應 MUST NOT 出現訊息內容、email 或房間名稱

#### Scenario: 查快照不寫稽核

- **WHEN** 呼叫本端點
- **THEN** MUST NOT 產生任何 `chat_audit_logs` 紀錄

#### Scenario: 缺少權限

- **WHEN** 呼叫者沒有 `BACKEND:MODERATION:VIEW`
- **THEN** 回 `403`

### Requirement: 推送營運快照（SSE）

`GET /api/admin/moderation/dashboard/stream` SHALL 以
Server-Sent Events 推送與快照端點相同的資料，需 `BACKEND:MODERATION:VIEW` 權限。

推送間隔 MUST 來自環境變數 `DASHBOARD_STREAM_INTERVAL_SEC`（預設 5），
MUST NOT 寫死在程式碼中。

**查詢 MUST 是實例級的**：同一個實例上不論有 1 個或 10 個訂閱者，
每個週期 MUST 只查一次資料庫，結果廣播給該實例上的所有訂閱者。
每個連線各自計時是最直覺的實作，而它會讓管理員人數直接乘上資料庫負載。

**沒有訂閱者時 MUST 停止查詢**：一個沒有人在看的頁面不該持續打資料庫。

連線建立時 MUST 立即推送一次，MUST NOT 讓客戶端空等一個間隔——
第一個間隔的空白畫面會被當成「壞掉了」。

單次查詢失敗 MUST NOT 中斷連線：記錄錯誤並在下一個週期重試。
資料庫短暫不可用時把所有管理員踢下線，只會讓他們同時重連。

**Request**：無

**Success Response** `200 OK`，`Content-Type: text/event-stream`：

```
data: {"onlineMembers":12,"pendingReports":3,"totalRooms":48,"totalMembers":156,"messagesToday":1204,"generatedAt":"2026-08-22T06:00:00.000Z"}

data: {"onlineMembers":13,"pendingReports":3,"totalRooms":48,"totalMembers":156,"messagesToday":1207,"generatedAt":"2026-08-22T06:00:05.000Z"}

```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:VIEW` 權限

#### Scenario: 訂閱後立即收到第一筆

- **WHEN** 客戶端建立連線
- **THEN** 立即收到一筆快照，不等第一個間隔

#### Scenario: 多個訂閱者共用一次查詢

- **WHEN** 同一個實例上有 3 個訂閱者
- **THEN** 每個週期 MUST 只執行一次快照查詢，3 個訂閱者收到相同內容

#### Scenario: 最後一個訂閱者離開

- **WHEN** 該實例上的訂閱者全部斷線
- **THEN** MUST 停止週期性查詢

#### Scenario: 單次查詢失敗

- **WHEN** 某個週期的資料庫查詢拋出錯誤
- **THEN** 連線 MUST 保持，錯誤以 error 等級記錄，下一個週期照常重試

#### Scenario: 缺少權限

- **WHEN** 呼叫者沒有 `BACKEND:MODERATION:VIEW`
- **THEN** 回 `403`，MUST NOT 建立串流
