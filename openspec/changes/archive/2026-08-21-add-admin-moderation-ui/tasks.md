> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> **驗證一律看 exit code**（`cmd > /tmp/x.log 2>&1; echo $?`），不要用 grep 數行數。
> 反向驗證要**兩邊都看**：破壞後紅、還原後綠——只看到紅不能證明任何事（已踩過）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1～3 是後端，必須先做完並重生成 api-client，否則前端沒有型別可用。
> 塊 1（email）與塊 2（訊息移除狀態）互相獨立，但兩者都改同一個回應形狀，
> **綁在同一次 swagger 重生成**（塊 3）比較省事，中間不要各生成一次。
> 塊 4～6 是前端，依動線順序做：佇列 → 詳情 → 處置。
> 塊 6 依賴塊 2 的 `targetMessageRemovedAt`——沒有它「移除／還原」無從二選一。
>
> **本 change 沒有 migration**，也沒有新環境變數。

## 1. 後端：檢舉回應補上當事人 email

- [x] 1.1 `LoadMemberPort` 新增批次取 email 的方法，沿用既有 `findActiveMemberIds(ids)`
      的形狀（吃 id 陣列、一次查完）。回傳 `id → email` 的對照，**查不到的 id 不出現在對照中**
- [x] 1.2 ~~在 `ChatReportListItem` / `ChatReportDetail` 上加欄位~~ **改為在 in-port 定義視圖型別**
      （`ReportListItemView` / `ReportDetailView`）。加在 out-port 的型別上會讓
      repository 在型別層面被要求提供 email——那與 1.3「補齊發生在 service」直接衝突。
      型別為 `string | null`。**null 不是可省略**——省略會讓呼叫端分不出「後端沒給」與「真的沒有」
- [x] 1.3 ⭐ email 的補齊放在 **service 層**而非 repository：
      `chat_reports` 刻意沒有外鍵（帳號刪除後檢舉仍須可審閱），
      在 repository 用 join 會把那個決定悄悄推翻。service 收集本頁的 id、
      呼叫 1.1 的方法、貼回結果
- [x] 1.4 ⭐ 單元測試釘住**一頁只查一次**：mock port，斷言呼叫次數為 1 而非「有被呼叫」。
      N+1 在 15 筆的測試資料上跑起來完全正常，只有計次抓得到
- [x] 1.5 單元測試：帳號已刪除 → 該欄為 `null` 且其餘欄位照常；
      檢舉人與被檢舉人是同一頁的不同筆 → id 去重後仍正確對應
- [x] 1.6 驗證：`pnpm --filter @app/api test` 全綠

## 2. 後端：詳情補上被檢舉訊息的移除狀態

- [x] 2.1 ⭐ 用**既有的** `ChatMessageRepositoryPort.findForModeration(messageId)` 取狀態——
      它已經回 `removedAt` 且不回內容。**不要新增查詢、不要新增 `chat-message-single-entry.spec.ts`
      的豁免**：那條守則守的是「訊息表只有一個入口」，而這裡本來就走得通
- [x] 2.2 `ChatReportDetail` 加 `targetMessageRemovedAt: Date | null`。
      **回時間戳不回布林**：布林會讓「何時被移除」永遠拿不到，而時間戳推得出布林
- [x] 2.3 訊息查不到時回 `null` 而非拋錯——檢舉的快照本來就不依賴訊息是否還在
- [x] 2.4 單元測試：已移除 → 回時間戳；未移除 → `null`；訊息不存在 → `null` 且詳情照常回傳
- [x] 2.5 驗證：`pnpm --filter @app/api test` 全綠

## 3. Swagger 與 api-client

- [x] 3.1 更新 `_report-list-item.yaml`、`list-reports.yaml`、`get-report.yaml` 三份。
      **不要用 `allOf` 合併共用欄位**——openapi-typescript 會產出交集型別，
      api-client 的 codegen 取 `.schema` 會失敗，而 `swagger:check` 抓不到，
      只有 `pnpm typecheck` 會紅（已踩過）
- [x] 3.2 新欄位標 `nullable: true`，並在 description 寫清楚 `null` 的兩種來源
      （帳號已刪除／訊息未被移除）
- [x] 3.3 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`，
      `schema.ts` 的 diff 要進 commit
- [x] 3.4 驗證：`pnpm --filter @app/api swagger:check` exit 0、`pnpm typecheck` 全綠

## 4. 後端 e2e 驗收

- [x] 4.1 e2e：佇列回傳 email；被檢舉人帳號刪除後該欄為 `null` 且該筆仍在列表中
- [x] 4.2 e2e：詳情在訊息被移除前後，`targetMessageRemovedAt` 分別為 `null` 與時間戳
- [x] 4.3 e2e：佇列仍然 **MUST NOT** 出現 `contentSnapshot`，且不出現 email 以外的成員欄位
      （角色、狀態、最後登入）——本端點的授權是 MODERATION 不是 ACCOUNT
- [x] 4.4 **反向驗證**：前兩項如預期（拿掉補 email → 2 紅；拿掉訊息狀態查詢 → 1 紅）。
      **第三項不紅**：在 `listSelect` 加 `contentSnapshot` 之後 e2e 全綠——
      與 `add-chat-report` 那次相同。往下追才確定真正的防線是
      **repository 的投影函式 `toListItem`**：把它改成 `...row` 展開才會紅（2 支）。
      多選一個欄位不會外洩，因為投影擋在後面；service 層展開也不會，
      因為它收到的 row 早就被投影過了
- [x] 4.5 驗證：`pnpm --filter @app/api test:e2e` exit 0

## 5. 前端：檢舉佇列頁

- [x] 5.1 `apps/web/src/routes/moderation/reports/` 建立頁面，沿用會員頁的結構
      （`page.tsx` + `components/` + `hooks/` + `lib/`）。**先讀 `routes/members/` 再動手**，
      不要發明新的組織方式
- [x] 5.2 URL state hook 沿用 `use-members-url-state.ts` 的模式：分頁 + 狀態篩選同步到 query
- [x] 5.3 ⭐ 狀態篩選**預設待處理**。enum → 中文的對照放 `lib/`，做成純函式
- [x] 5.4 ⭐ email 為 `null` 時顯示「已刪除的帳號」+ id 尾 8 碼。
      做成純函式並寫單元測試——這是最容易 render 出空白格的地方
- [x] 5.5 `App.tsx` 加路由、`_nav-items.ts` 加一筆（`Flag` 圖示、group「聊天管理」、
      `requiredPermission: 'BACKEND:MODERATION:VIEW'`）
- [x] 5.6 單元測試：enum 對照、email fallback 顯示、狀態 Badge 的三種樣式
- [x] 5.7 驗證：`pnpm --filter @app/web test` 全綠、`pnpm build` 乾淨

## 6. 前端：詳情頁與時間軸

- [x] 6.1 `/moderation/reports/:reportId` 獨立路由（不是 Dialog，理由見 design.md D3）
- [x] 6.2 ⭐ 內容快照**必須標示它是檢舉當下的快照**而非訊息現況。
      不標示會讓管理員誤判他看到的是現在的內容
- [x] 6.3 ⭐ **不得 prefetch 詳情**（含 hover 預載）：查看會寫稽核，
      prefetch 會製造一堆沒有人真的看過的「查看」紀錄。詳情查詢明確設 `staleTime`
- [x] 6.4 `404` → 顯示「檢舉不存在」與返回佇列的連結，不要空白畫面
- [x] 6.5 時間軸元件：接 `GET /moderation/members/:memberId/timeline`，
      只載第一頁 + 分頁控制，**不做無限捲動**。action enum → 中文對照做成純函式
- [x] 6.6 單元測試：action 對照、空時間軸的空狀態、快照標示文案存在
- [x] 6.7 驗證：`pnpm --filter @app/web test` 全綠

## 7. 前端：處置動作與判定表單

- [x] 7.1 ⭐ 「移除訊息」與「還原訊息」依 `targetMessageRemovedAt` **二選一顯示**，
      不得同時出現。這個判斷做成純函式並寫測試
- [x] 7.2 ⭐ 四個處置動作在只有 VIEW 權限時 **disabled + tooltip**，
      **不要隱藏**——隱藏會讓人以為功能不存在
- [x] 7.3 每個動作先經確認對話框（沿用既有的 `DeleteConfirmDialog` 模式，先看能不能重用）。
      停權的對話框**必須說明會中斷該成員既有的即時連線**
- [x] 7.4 ⭐ **不使用 optimistic update**：成功後 invalidate 重查。
      這些動作對真人有實質影響，而 optimistic update 的本質是「先假設成功」
- [x] 7.5 判定表單：react-hook-form + zod + `standardSchemaResolver`
      （**不要用 `zodResolver`**，與 zod 4.1+ 型別簽章衝突）。
      註記選填、上限 500 字，前端擋下
- [x] 7.6 ⭐ 判定的可選項**只有已處理與已駁回**。後端不接受回到待處理，
      前端提供它只會製造必然失敗的操作
- [x] 7.7 元件測試：VIEW-only → 動作 disabled；移除／還原二選一；註記超長擋下送出
- [x] 7.8 **反向驗證**：把 7.2 的權限判斷拿掉 → 7.7 紅；
      把 7.1 的二選一改成都顯示 → 對應測試紅。兩者還原後都要綠
- [x] 7.9 驗證：`pnpm typecheck && pnpm lint && pnpm test:cov` 全綠（web 門檻 75/75/60/75）

## 8. 收尾

- [x] 8.1 跑完整驗證鏈並貼出實際輸出（**exit code**），含 `test:e2e` 與 `build`
- [x] 8.2 `smoke-test.md`：從佇列進詳情、做一次移除再還原、判定一筆的手動步驟。
      **含一項只有人工驗得到的**：用只有 VIEW 權限的帳號登入，確認處置動作是 disabled 而非消失
- [x] 8.3 `openspec/project.md` 與 `project/frontend.md`：補上審閱頁與「詳情走獨立路由」的例外
- [x] 8.4 更新 `tasks/todo.md`：M4 拆出已完成的部分，SSE 儀表板與 360 視圖留在待辦
- [x] 8.5 新踩到的坑寫進 `tasks/lessons.md`（**沒踩到就不要硬寫**）
- [x] 8.6 `openspec archive add-admin-moderation-ui`
