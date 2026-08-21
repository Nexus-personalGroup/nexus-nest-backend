> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由的塊加 `pnpm --filter @app/api test:e2e`；動到 WS 的塊加 `test:integration`；
> 動到 module 接線加 `pnpm build`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema + env）是所有後續的前提。
> 塊 2 **必須在塊 3、4 之前**：守則先到位，寫埋點時才會被擋。
> 塊 3（稽核）與塊 4（指標）互相獨立，可各自驗證。
> 塊 5 是驗收。
>
> **本 change 沒有新增錯誤碼**——稽核與指標都不對使用者回報失敗。
> 若中途發現需要，記得錯誤碼與 exception 必須同塊（已踩過兩次）。

## 1. 資料模型與環境變數

- [x] 1.1 `ChatAuditLogRecord`：`id` / `memberId` / `action`（DB enum）/ `roomId?` / `targetMemberId?` / `targetMessageId?` / `createdAt`。**所有 `DateTime` 標 `@db.Timestamptz(3)`**
- [x] 1.2 `action` 用 **Prisma enum** 而非字串欄位——非法值在寫入時就被擋，讀取端也不必用斷言把 string 轉回聯集（已踩過）
- [x] 1.3 **不加 content 欄位**。內容已在 `chat_messages`，複製一份等於多一條洩漏路徑
- [x] 1.4 索引：`(memberId, createdAt)` 供「這個人的行為時間軸」；`(roomId, createdAt)` 供房間層級調查
- [x] 1.5 `///` 描述寫清楚「只記無法回溯的行為」與「不記訊息內容」的理由，`gen:comments` 產生 `COMMENT ON`。**用完整語句比對附加**，不要用跨行 regex（已踩過）
- [x] 1.6 **migration 先 `--create-only`**，附加 `COMMENT ON` 後再 `migrate deploy`——`migrate dev` 會立刻套用，之後才附加會造成 checksum 不符（已踩過）
- [x] 1.7 新增環境變數 `CHAT_AUDIT_ENABLED`（預設 true）到 `envSchema`。**不要與 `APPLICATION_METRICS_ENABLED` 共用**（見 design.md D5）；`.env.example` 的行給使用者貼
- [x] 1.8 驗證：`db:migrate`、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 新增守則：呼叫稽核 port 的位置必須接住錯誤。判定**必須先去除註解**
- [x] 2.2 新增守則：`src/application` 與 `src/domain` 不得 import `prom-client` 或其 NestJS 包裝
- [x] 2.3 **合成輸入的自我測試**：(a) 未接錯誤的呼叫 → 抓出；(b) `.catch(...)` → 通過；(c) `try/catch` 包住 → 通過；(d) 只有註解提到 → 仍抓出；(e) adapter 層 import prom-client → 不抓
- [x] 2.4 **確認現況是綠的**再進塊 3——此時還沒有任何稽核呼叫，規則應該空轉但不誤報。**掃描範圍檢查要能發現空轉**（掃到 0 個 import 時要紅，否則規則失效無人知曉）
- [x] 2.5 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化

## 3. 行為稽核

- [x] 3.1 `ChatAuditPort`：`record(event)`，`action` 是**聯集型別**不是 string（typo 會產生沒人發現的新類別）
- [x] 3.2 Prisma 實作；`CHAT_AUDIT_ENABLED` 關閉時直接返回，不查也不寫
- [x] 3.3 埋點位置：`EnsureRoomMembership` 不記（唯讀）；記在 **加入房間**（WS handler 成功後）、**離開房間**（`LeaveRoomService`）、**撤回成功／被拒**（`RetractMessageService`）、**被限流擋下**（`SendMessageService`）
- [x] 3.4 ⭐ **送出訊息不記稽核**。單元測試釘住這件事——它是最容易「順手加上去」的一筆，而它是純重複（見 design.md D1）
- [x] 3.5 所有呼叫點都 `catch` 並以 error 等級記錄。**單元測試釘住：稽核拋錯時業務動作仍成功**
- [x] 3.6 驗證：`pnpm test` 全綠、塊 2 的守則通過

## 4. Prometheus 指標

- [x] 4.1 `MetricsPort`：`incrementMessages` / `observeMessageWriteSeconds` / `incrementRateLimited` / `incrementWsEvent` / `setConnections`
- [x] 4.2 Prometheus 實作在 `adapter/out`，用 `@willsoto/nestjs-prometheus` 的 provider 工廠
- [x] 4.3 ⭐ **標籤不得用房間 ID**（無界基數會拖垮 Prometheus）。`chat_ws_events_total` 只用 `event` + `outcome`
- [x] 4.4 `chat_ws_connections` 由 gateway 的心跳更新；**不要自己加 instanceId 標籤**——Prometheus 依 scrape target 自動帶，自己加會讓實例重啟產生新的時間序列
- [x] 4.5 `chat_message_write_seconds` 量的是 `append()` 的耗時，含配號的鎖等待——那正是要觀察的東西
- [x] 4.6 `APPLICATION_METRICS_ENABLED` 關閉時，port 換成 no-op 實作，業務程式碼不需要判斷
- [x] 4.7 驗證：`pnpm test` 全綠、`pnpm build` 乾淨

## 5. 驗收

- [x] 5.1 e2e：`GET /api/metrics` 含自訂指標名稱（開關開啟時）
- [x] 5.2 e2e：離開房間後有稽核紀錄；發送訊息後**沒有**稽核紀錄
- [x] 5.3 e2e：稽核關閉時不寫入，業務動作照常
- [x] 5.4 整合：被限流擋下後有稽核紀錄，且該訊息沒有落庫
- [x] 5.5 **反向驗證**：把某個呼叫點的 `catch` 拿掉 → 守則變紅；讓稽核 port 拋錯 → 業務測試仍綠（證明 best-effort 真的成立）
- [x] 5.6 驗證：`test:e2e` 與 `test:integration` 全綠，貼出實際輸出

## 6. 文件與收尾

- [x] 6.1 `openspec/project.md`：補上可觀測性
- [x] 6.2 `openspec/project/backend-utilities.md`：指標與稽核的使用方式（新增埋點時該怎麼做）
- [x] 6.3 `smoke-test.md`：curl `/api/metrics` 與查稽核表的步驟
- [x] 6.4 跑完整驗證鏈並貼出實際輸出
- [x] 6.5 更新 `tasks/todo.md`：M3 埋點完成；**檢舉入口**與**後台查詢端點**維持明確待辦
- [x] 6.6 新踩到的坑寫進 `tasks/lessons.md`
- [x] 6.7 `openspec archive add-chat-observability`。**注意**：新增一支能力，記得補 Purpose 不要留 TBD
