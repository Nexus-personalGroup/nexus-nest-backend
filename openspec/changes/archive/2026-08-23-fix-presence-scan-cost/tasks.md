> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 WS / presence 加 `pnpm --filter @app/api test:integration`（真實 Redis，**不可 mock**）；
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 時間相關的測試寫完用 `TZ=UTC` 再跑一次（已踩過）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（RedisService 的 SET 操作）是塊 2 的前提。
> 塊 3（sweep 校正）必須與塊 2 同一個 commit——只做塊 2 會讓漂移沒有修正機制，
> 那是比現況更糟的中間狀態。
> 塊 4 的守則涵蓋塊 2 的成果。
>
> **本 change 沒有 migration、沒有新環境變數。**

## 1. RedisService 的 SET 操作

- [x] 1.1 `setAdd` / `setRemove` / `setCard` 三支，沿用既有方法的
      `isAvailable` 檢查與錯誤處理慣例（**先讀 `hashSet` 那幾支再寫**）
- [x] 1.2 ~~`setCard` 回 0 而非拋錯~~ **改為與既有的 presence 方法一致：拋出。**
      `hashSet` / `hashGetAll` 的註解寫得很清楚——presence 若能靜默失敗，
      呼叫端會拿到「沒有任何人在線」而據此做出錯誤決定。而 `DashboardStream.publish()`
      **本來就會 catch、記錄、下個週期重試**，所以拋出的結果是儀表板停在上一筆快照
      並讓「最後更新於」自己變舊——**過期看得出來，比顯示一個假的 0 好**
- [x] 1.3 單元測試：三支各自的正常路徑，以及 Redis 不可用時的行為
- [x] 1.4 驗證：`cd apps/api && pnpm jest src/infrastructure/redis` 全綠

## 2. presence 改用 SET 索引

- [x] 2.1 `cache-keys.ts` 加「在線成員索引」的 key（單一 key，不帶 memberId）。
      註解要寫明**它是衍生索引、真相在連線 Hash 上**——
      否則日後看到 presence 相關的 SET 會誤以為「不得用無時效集合」那條規則被打破
- [x] 2.2 ⭐ `markOnline` 在 `wasOffline` 為 true 時 `SADD`；
      `markOffline` 在 `nowOffline` 為 true 時 `SREM`。
      這兩個布林本來就已經回傳，**不需要新的判斷**
- [x] 2.3 ⭐ **`heartbeat` 不得動 SET。** 看起來更安全（能自我修復漏掉的 SADD），
      實際上是把頻率最高的操作變成每次多一個往返。校正交給 sweep
- [x] 2.4 ⭐ `countOnlineMembers()` 改用 `SCARD`，**移除 scan + N 次 HGETALL**
- [x] 2.5 單元測試：上線／下線時 SET 有被維護、心跳時沒有、
      `countOnlineMembers` 只呼叫一次 Redis（**斷言呼叫次數**，不是「有被呼叫」）

## 3. sweep 的校正（必須與塊 2 同一個 commit）

- [x] 3.1 ⭐ `sweepStale` 的既有遍歷順手算出「還有未逾時連線的成員」，
      與 SET 做**差集**校正：多的 `SREM`、少的 `SADD`
- [x] 3.2 ⭐ **不得整份刪除後重建**——那有一個窗口讓 `SCARD` 讀到 0，
      而那個瞬間儀表板會顯示「線上 0 人」，一個看起來像故障的正確操作
- [x] 3.3 單元測試：SET 有多餘成員 → 被移除；SET 少了在線成員 → 被補上；
      **一致時不發出任何寫入**（避免每個 sweep 週期都白寫一輪）
- [x] 3.4 ⭐ 整合測試（真實 Redis）：模擬「實例被強制終止」——
      直接刪掉某成員的 presence key 而不呼叫 `markOffline`，
      跑一次 sweep 後 `countOnlineMembers()` MUST 回到正確值。
      **這是這個 change 唯一驗得到「漂移會被修正」的地方**
- [x] 3.5 驗證：`pnpm --filter @app/api test:integration` exit 0

## 4. 守則：掃描 pattern 只能在清理中使用

- [x] 4.1 ⭐ 新增守則：任何用到 `buildPresenceScanPattern` 的**方法**
      都必須列入 allowlist 並註明理由。
      **判定以方法為單位而非檔案**——presence 的 adapter 同時有清理與查詢兩種方法，
      以檔案為單位會讓 `countOnlineMembers` 這次的錯直接漏掉
- [x] 4.2 合成輸入自我測試：清理方法用它 → 通過（在 allowlist 中）；
      另一個方法用它 → 抓出；只有註解提到 → 不算違規
- [x] 4.3 「掃描範圍有效」測試：掃到 0 個使用點代表解析失效，規則會空轉
- [x] 4.4 ⭐ **反向驗證**：把 `countOnlineMembers` 改回用 scan → 守則要紅；還原後綠
- [x] 4.5 驗證：`pnpm --filter @app/api test:arch` exit 0

## 5. 測試替身與既有測試

- [x] 5.1 e2e 的 Redis mock（`test/setup/test-app.ts`）補三個 SET 操作。
      **`setCard` 預設回 0**——與既有的 `scanKeys: []` 同樣的意思
- [x] 5.2 確認 `dashboard.e2e-spec.ts` 的「線上人數為 0」仍然成立
- [x] 5.3 驗證：`pnpm --filter @app/api test:e2e` exit 0

## 6. 收尾

- [x] 6.1 跑完整驗證鏈並貼出實際輸出（**exit code**），
      含 `test:e2e`、`test:integration`、`build`
- [x] 6.2 `smoke-test.md`：**含一項只有人工驗得到的**——
      開兩個瀏覽器分頁連上 WS，確認儀表板的在線人數是 **1 不是 2**
      （計數單位是「人」不是「連線」）
- [x] 6.3 `openspec/project/backend-runtime.md`：補上衍生索引與校正機制
- [x] 6.4 更新 `tasks/todo.md`：路線圖的第 2 項打勾
- [x] 6.5 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 6.6 `openspec archive fix-presence-scan-cost`
