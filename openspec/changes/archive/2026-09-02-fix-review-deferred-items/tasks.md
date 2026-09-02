> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **第 1 塊要加跑 e2e**（動到 gateway 的連線建立路徑）；
> **第 2 塊要加跑 `db:migrate` 與 e2e**（動到 schema 與 migration）。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：兩塊互相獨立，可任意順序。
>
> **這個 change 沒有環境變數、API 契約、前端變更。**

## 1. 連線數上限改成寫入後回讀

- [x] 1.1 `ChatGateway`：`markOnline` 之後重新 `getConnections()`，
      依 `lastSeenAt` 升冪 + `instanceId:socketId` 為次鍵排序，找出自己的索引
- [x] 1.2 ⭐ 索引 `>= WS_MAX_CONNECTIONS_PER_MEMBER` 時**先 `markOffline` 撤掉自己**
      再拒絕——留著會佔用名額直到 TTL 過期，讓後續的合法連線被誤拒
- [x] 1.3 ⭐ **次鍵不是防禦性程式碼**，要在註解寫出沒有它會怎樣：
      同毫秒寫入時兩個實例可能得到不同排序 → 兩條互相禮讓（少一條）
      或兩條都認為自己合格（多一條）
- [x] 1.4 ⭐ **不要改成「只比較總數」**：那個條件對所有超額者同時成立，
      會把該拒一條變成兩條都拒。註解要寫這件事，否則下一個人會「簡化」掉排序
- [x] 1.5 保留既有的預先檢查當快路徑（常見情況省一次寫入）
- [x] 1.6 ⭐ 單元測試：**恰好超額一條時只拒一條**。
      ⚠️ **第一版是假測試**——全部循序呼叫 `handleConnection`，而 TOCTOU 是交錯的；
      循序時 `index >= limit` 與 `length > limit` 行為一致。改成**直接呼叫判定函式**
      建構交錯後的狀態才驗得到
- [x] 1.7 單元測試：已達上限時兩條都拒，且兩條都不留下 presence 欄位
- [x] 1.8 單元測試：未達上限時不因回讀而誤拒
- [x] 1.9 ⭐ **反向驗證四種破壞**，各自打中對應的測試、還原全綠：
      拿掉次鍵 / 改成只比較總數 / 拿掉回滾 `markOffline` / 整段回讀判定拿掉。
      ⚠️ **前三種第一次跑都是綠的**，全是測試的問題不是程式的問題：
      次鍵那支敗在 mock 依插入順序回傳而 JS `sort` 穩定；
      回滾那支敗在被**快路徑**攔截（`markOnline` 根本沒跑）。
      另有一次是**測試設錯而非程式錯**——插隊者時間戳設得比自己晚，
      那樣超額的是插隊者，程式判斷正確
- [x] 1.10 `pnpm --filter @app/api test:e2e` 全綠（動到連線建立路徑）

## 2. `users` 的模糊搜尋加 pg_trgm GIN 索引

- [x] 2.1 `schema.prisma`：`UserRecord` 加兩個 GIN 索引
      （`email` / `displayName`，`ops: raw("gin_trgm_ops")`，`type: Gin`）
- [x] 2.2 migration 加 `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
      ——⭐ **`IF NOT EXISTS`**：正式環境若非 superuser，DBA 先建好之後
      migration 仍要能跑過
- [x] 2.3 ⭐ **確認 `prisma migrate dev` 不會產生「刪掉索引」的後續 migration**
      ——索引只寫在 SQL 裡而沒宣告進 schema 時就會發生（見 design D3）
- [x] 2.4 `gen:comments` 只處理欄位註解（`COMMENT ON COLUMN`），不涵蓋索引，無需處理
- [x] 2.5 ⭐ 驗證索引真的被用到：對測試資料執行
      `EXPLAIN` 確認出現 Bitmap Index Scan 而非 Seq Scan
- [x] 2.6 ⭐ 驗證**語意不變**：`email=@gmail.com`（樣式在中段）仍比對得到
- [x] 2.7 既有的 `listUsers` 相關測試須維持綠（搜尋行為不得改變）
- [x] 2.8 `pnpm --filter @app/api db:migrate` + `test:e2e` 全綠

## 3. 收尾

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 3.2 `openspec validate --specs --strict` 通過
- [x] 3.3 `tasks/todo.md`：從「已知缺口」移除這兩條
      ——⭐ **保留另外兩項**（建群組同意權、UUID 探測器），它們的判斷沒有變
- [x] 3.4 `tasks/lessons.md`：補「驗競態的測試如果是循序呼叫的，它驗不到競態」
- [x] 3.5 `openspec archive fix-review-deferred-items`
