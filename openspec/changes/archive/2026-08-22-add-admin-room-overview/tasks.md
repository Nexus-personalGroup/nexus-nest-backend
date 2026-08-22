> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 跑單一測試檔：`cd apps/api && pnpm jest <path>`（**不要 `--filter`**）；
> 前端是 `cd apps/web && pnpm test`（**不要 `pnpm test run`**）。兩者都踩過。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（列表）與塊 2（詳情）互相獨立，但兩者都動 swagger，綁在同一次重生成（塊 3）。
> 塊 5～6 是前端，依賴塊 3 的型別。塊 6 動到既有的成員概覽頁。
>
> **動工前先做的一件事**：把 `ui-room-overview` 要顯示的每一塊資料，
> 逐條對回 `api-moderation` 的回應欄位。上個 change 就是漏了這一步，
> 寫到前端才發現少一支端點。
>
> **本 change 沒有 migration**——訊息量用 `last_seq`，排序索引的判斷點見 design.md D4。

## 1. 後端：聊天室列表端點

- [x] 1.1 ⭐ `messageCount` 直接取 `chat_rooms.last_seq`，**不要 `count(*)`**。
      訊息列永遠不刪，`last_seq` 就是歷史總數，而它已經在房間那一列上——
      count 會多一次查詢換一個相同的答案
- [x] 1.2 `ChatRoomRepositoryPort` 加 `listAll(params)`：支援 `roomType` 篩選與分頁，
      依 `createdAt` 遞減。**不要複用 `listByMember`**——那支是「某人的房間」，
      條件不同，硬塞一個 optional memberId 會讓兩種語意混在同一個查詢裡
- [x] 1.3 `roomType` query 用 `z.enum(['DIRECT', 'GROUP']).optional()`
- [x] 1.4 單元測試：篩選各自只回對應類型、未指定回全部、
      **`messageCount` 來自 `lastSeq`**（mock 回 lastSeq=10 但實際訊息列 0 筆，斷言仍是 10）
- [x] 1.5 驗證：`cd apps/api && pnpm test` 全綠

## 2. 後端：單一房間概覽端點

- [x] 2.1 回傳列表的欄位 + `members`（`memberId` / `email` / `joinedAt`）
- [x] 2.2 ⭐ email **一次批次補齊**，沿用 `LoadMemberPort.findEmailsByIds()`。
      **不要為此抽共用 helper**——三處的輸入形狀都不同（兩造 / 對造 / 成員陣列），
      共用的抽象要多一個 selector 參數，比重複三行 map 更難讀
- [x] 2.3 成員清單**不分頁**（見 design.md D3）
- [x] 2.4 房間不存在 → `CHAT_ROOM_NOT_FOUND`（既有錯誤碼）
- [x] 2.5 ⭐ 回應**不得含任何訊息內容或訊息 ID**——房間詳情不是內容存取路徑
- [x] 2.6 單元測試：成員 email 正確、帳號已刪除 → `null` 且仍在清單中、
      **補 email 只查一次**、房間不存在拋例外
- [x] 2.7 驗證：`cd apps/api && pnpm test` 全綠

## 3. Swagger 與 api-client

- [x] 3.1 兩支 yaml，註冊進 `openapi.yaml`。**不要用 `allOf`**（已踩過：
      openapi-typescript 產出交集型別，codegen 取 `.schema` 失敗，只有 `typecheck` 會紅）
- [x] 3.2 ⭐ `messageCount` 的 description 要寫明是**歷史累計**（含已撤回、已移除），
      不是「目前存在的訊息數」。不寫的話日後有人拿它跟資料庫列數對不起來會以為有 bug
- [x] 3.3 `swagger:bundle` + `api-client generate`，`schema.ts` 進 commit
- [x] 3.4 驗證：`swagger:check` exit 0、`pnpm typecheck` 全綠

## 4. 後端 e2e 驗收

- [x] 4.1 e2e：列表回傳群組與私聊，私聊的 `name` 為 `null`
- [x] 4.2 e2e：`roomType=GROUP` / `DIRECT` 各自只回對應類型
- [x] 4.3 ⭐ e2e：某房間發 3 則訊息後**撤回 1 則、移除 1 則**，
      `messageCount` 仍為 `3`——這支釘住「歷史累計」的語意
- [x] 4.4 e2e：詳情的成員清單含 email；某成員軟刪除後該位 `email` 為 `null` 且仍在清單中
- [x] 4.5 ⭐ e2e：兩支端點的回應都**不含訊息內容**——
      建一則內容獨特的訊息，斷言 `JSON.stringify(res.body)` 不含它
- [x] 4.6 e2e：房間不存在 → 404；只有 `ACCOUNT:VIEW` → 兩支都 403
- [x] 4.7 **反向驗證**：在詳情回應加上訊息內容 → 4.5 要紅；
      拿掉 `roomType` 過濾 → 4.2 要紅。
      **`messageCount` 改成 `count(*)` 不會紅**——訊息永不刪除，兩者本來就相等，
      這是正確的結果而非測試失效。4.3 守的是**語意**（撤回與移除仍計入），
      要驗它就把 count 加上 `where: { removedAt: null, retractedAt: null }`，那才會紅。
      資料來源（`last_seq` vs `count`）的差別要等真的做了訊息清理才顯現，
      現在沒有任何測試分得出來——這一點寫在這裡，不要誤以為有守則在守
- [x] 4.8 驗證：`pnpm --filter @app/api test:e2e` exit 0

## 5. 前端：列表與詳情

- [x] 5.1 `routes/moderation/rooms/page.tsx`：DataTable 5 欄，沿用會員頁的結構
- [x] 5.2 ⭐ 「訊息量」要標明是**歷史累計**（欄位標題或 tooltip）——
      不標會被誤讀成「現在有幾則」
- [x] 5.3 類型篩選（全部 / 群組 / 私聊）+ 分頁，同步 URL query。
      `roomLabel()` 已存在（成員概覽用過），**直接複用**
- [x] 5.4 `routes/moderation/room-detail/page.tsx`：概覽 + 成員清單，
      `404` → 「聊天室不存在」與返回方式
- [x] 5.5 `App.tsx` 加兩條路由、`_nav-items.ts` 加一筆
      （`MessagesSquare`、group「聊天管理」、`BACKEND:MODERATION:VIEW`）
- [x] 5.6 單元測試：類型中文對照、私聊名稱 fallback、訊息量標示存在
- [x] 5.7 驗證：`cd apps/web && pnpm test` 全綠、`pnpm build` 乾淨

## 6. 前端：把三個實體接起來

- [x] 6.1 ⭐ 成員概覽的 `MemberRoomsPanel` 每一列改為連往房間詳情
- [x] 6.2 ⭐ 房間詳情的成員清單每一位改為連往成員概覽
- [x] 6.3 ⭐ 房間詳情**不得有任何前往訊息的連結或按鈕**
- [x] 6.4 元件測試：房間列連結的 href 正確、成員列連結的 href 正確、
      帳號已刪除的成員仍可點
- [x] 6.5 **反向驗證**：把 6.1 的連結拿掉 → 對應測試紅；還原後綠
- [x] 6.6 驗證：`pnpm typecheck && pnpm lint && pnpm test:cov` 全綠

## 7. 收尾

- [x] 7.1 跑完整驗證鏈並貼出實際輸出（**exit code**），含 `test:e2e` 與 `build`
- [x] 7.2 `smoke-test.md`：走完「檢舉 → 人 → 房間 → 另一個人」一整條動線。
      **含一項只有人工驗得到的**：確認房間詳情頁上真的沒有任何通往訊息的入口
- [x] 7.3 `openspec/project.md`：補上聊天室總覽
- [x] 7.4 更新 `tasks/todo.md`：M4 剩 SSE 儀表板
- [x] 7.5 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 7.6 `openspec archive add-admin-room-overview`
