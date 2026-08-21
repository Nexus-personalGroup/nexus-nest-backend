> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 WS 的塊加 `pnpm --filter @app/api test:integration`；動到 module 接線加 `pnpm build`。
> **驗證一律看 exit code**（`cmd > /tmp/x.log 2>&1; echo $?`），不要用 grep 數錯誤行數——
> 有色輸出會讓樣式永遠匹配不到（已踩過）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（env + 錯誤碼）是前提。錯誤碼與 exception 必須同塊（已踩過兩次）。
> 塊 2 是核心，塊 3 只是把它接到 gateway 上。
> 塊 4 是驗收——「兩條連線各自計數」只有整合測試驗得出來。
>
> **本 change 沒有 migration**。

## 1. 環境變數與錯誤碼

- [x] 1.1 `WS_CONNECTION_EVENT_LIMIT`（預設 20）與 `WS_CONNECTION_EVENT_WINDOW_SEC`（預設 1）
      加進 `envSchema`。**用 `z.enum` 的那個慣例只適用布林**，這兩個是數字沿用 `z.coerce.number()`
- [x] 1.2 新增錯誤碼 `WS_RATE_LIMITED` **以及使用它的 domain exception**（三檔同塊）。
      **不要重用 `CHAT_MESSAGE_RATE_LIMITED`**——那是業務層的限流，客戶端的退避策略不同
- [x] 1.3 `.env.example` 的兩行給使用者貼
- [x] 1.4 驗證：`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 限流本身（TDD）

- [x] 2.1 ⭐ 計數放**本實例的記憶體**，不走 Redis（見 design.md D1）。
      每條連線一個計數器，附在 socket 上或以 socketId 為鍵的 Map
- [x] 2.2 ⭐ **連線斷開時必須清掉計數**——否則就是記憶體洩漏。
      單元測試釘住這件事，它是這類實作最容易漏的一步
- [x] 2.3 滑動視窗或固定視窗都可以，但**要在註解裡說明選了哪個與為什麼**。
      固定視窗在邊界會允許兩倍瞬時流量，對「明顯失控」的門檻而言可接受
- [x] 2.4 單元測試：門檻內放行、超過擋下、視窗滑過後恢復、兩條連線互不影響
- [x] 2.5 驗證：`pnpm test` 全綠

## 3. 接到 gateway

- [x] 3.1 ⭐ 用 **NestJS 的 WS guard 或 interceptor**，不要在每個 handler 裡各加一行——
      後者會在新增 handler 時被忘記，而那正是本 change 要防的那種缺口
- [x] 3.2 ⭐ **`ping` 也要計入**，沒有例外清單（見 design.md D3）
- [x] 3.3 超過時丟棄事件並回 `server:error`（`WS_RATE_LIMITED`），**不斷線**
- [x] 3.4 確認 `WsExceptionFilter` 會把新的 exception 轉成 `server:error`——
      它已經處理 `DomainException`，應該不用改，但要**實際驗證**而不是假設
- [x] 3.5 ~~移除 `handleSyncRoom` 豁免~~ **改為：只移除該筆理由裡「連線層是跟進項」那段**。
      原本的寫法與 3.6 及 spec 直接衝突——spec 明訂「連線層限流 MUST NOT 被當成豁免的理由」，
      而整筆刪掉會讓 `handleSyncRoom` 變成未表態（守則當場變紅），
      唯一的補救是替一支唯讀查詢加業務層限流，那是為了滿足規則而加程式碼。
      現在該筆豁免只站在「唯讀且成本有界」上，與連線層無關——`handleJoinRoom` 同理，原樣保留
- [x] 3.6 ⭐ 守則補一條：**連線層限流不得被當成豁免的理由**（見 spec）。
      合成輸入測試：理由裡提到「連線層」的豁免 → 抓出
- [x] 3.7 驗證：`pnpm test` 全綠、`pnpm build` 乾淨

## 4. 驗收

- [x] 4.1 整合：連續快速送出超過門檻的事件 → 收到 `WS_RATE_LIMITED` 且**連線仍在**
- [x] 4.2 ⭐ 整合：**兩條連線各自計數**——一條被擋不影響另一條
- [x] 4.3 整合：等過一個視窗後恢復正常
- [x] 4.4 ⭐ 整合：**`ping` 也會被擋**——證明沒有例外清單
- [x] 4.5 整合：被擋下的送訊息事件**沒有落庫**
- [x] 4.6 **反向驗證**：把 guard 拿掉 → 4.1 與 4.4 都要紅；
      把「斷開時清計數」拿掉 → 2.2 變紅
- [x] 4.7 驗證：`test:integration` 全綠（**先導到檔案再看 exit code**）

## 5. 文件與收尾

- [x] 5.1 `openspec/project.md`：補上連線層限流
- [x] 5.2 `openspec/project/backend-runtime.md`：**兩種限流的分工**——
      這是最容易被誤解成「重複」而被移除其一的地方
- [x] 5.3 `smoke-test.md`：手動打爆一條連線的步驟
- [x] 5.4 跑完整驗證鏈並貼出實際輸出（**exit code**）
- [x] 5.5 更新 `tasks/todo.md`：把「已知缺口」的 WS 限流那條移到已完成
- [x] 5.6 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 5.7 `openspec archive add-ws-connection-throttle`。**本 change 沒有新能力**，
      只 MODIFIED 兩支既有的——封存後不需要補 Purpose
