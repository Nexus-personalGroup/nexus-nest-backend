> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 module 接線加 `pnpm build`；本 change **沒有 controller / 路由**，
> 但 e2e 會用真 DB 驗清理行為。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（env）是所有後續的前提。
> 塊 2 **必須在塊 3 之前**：守則先到位。
> 塊 3（清理邏輯）是核心，塊 4 只是把它接到排程上。
> 塊 5 是驗收。
>
> **本 change 沒有 migration、沒有新錯誤碼**——清理不對使用者回報失敗。

## 1. 環境變數

- [x] 1.1 `CHAT_RETENTION_ENABLED`（預設 true）。**用 `z.enum(['true','false'])`** 而非鄰近的 `z.string()`——後者會讓 `=TRUE`（大寫）靜默關閉清理（技術債已記在 todo）
- [x] 1.2 `CHAT_AUDIT_RETENTION_DAYS`（預設 180）、`CHAT_REPORT_RETENTION_DAYS`（預設 365）
- [x] 1.3 `CHAT_RETENTION_CRON`（預設凌晨，避開尖峰）
- [x] 1.4 **不要與 `LOG_*` 共用任何一個**（見 design.md D5）；`.env.example` 的行給使用者貼
- [x] 1.5 驗證：`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 守則先行

- [x] 2.1 ⭐ 新增守則：**清理程式碼不得碰 `chat_messages`**。這是 design.md D1 的機器化——
      「清訊息會把 seq 缺口帶回來」寫在文件裡會被忘記，寫成守則不會
- [x] 2.2 判定範圍：`src/adapter/out/persistence/**` 之下、檔名含 `Purge` 或 `Retention` 的檔案
- [x] 2.3 **合成輸入的自我測試**：(a) 清理檔案出現 `chat_messages` → 抓出；(b) 出現 `chat_audit_logs` → 通過；(c) 只有註解提到 → 不抓
- [x] 2.4 **確認掃描範圍有效**：掃到 0 個清理檔案時要紅，否則規則會空轉
- [x] 2.5 驗證：`pnpm --filter @app/api test:arch`，貼出護欄項數變化

## 3. 清理邏輯（TDD）

- [x] 3.1 `ChatRetentionPort`：`purgeAuditBefore(cutoff)` / `purgeReviewedReportsBefore(cutoff)`
- [x] 3.2 沿用 `PrismaLogPurgeRepository` 的分批模式（`ctid IN (SELECT ... LIMIT n)`、批次間讓出、保險上限）。**表名走型別鎖死的聯集**，不接受任意字串
- [x] 3.3 ⭐ **檢舉的清理條件是 `reviewed_at < cutoff AND status <> 'PENDING'`**。單元測試釘住「未判定的不清」——那是最容易寫成 `created_at < cutoff` 的地方
- [x] 3.4 `ChatRetentionService`：算 cutoff、呼叫 port、記錄刪除筆數
- [x] 3.5 單元測試釘住：兩張表的 cutoff 各自獨立計算（不同的保留天數）
- [x] 3.6 驗證：`pnpm test` 全綠

## 4. 排程

- [x] 4.1 `ChatRetentionScheduler`，比照 `LogRetentionScheduler`：**動態註冊而非 `@Cron()` 裝飾器**——裝飾器內的 cron 表達式在模組載入時求值，早於 `dotenv.config()`
- [x] 4.2 關閉時記錄 **warn**（不是 log）——無界成長是知情的選擇，不該無聲發生
- [x] 4.3 清理失敗只記錄、不讓排程掛掉
- [x] 4.4 單元測試**必須 mock `cron`**，否則會留下真的計時器讓 jest 掛住（`ExampleScheduler.spec.ts` 是範例，已踩過）
- [x] 4.5 驗證：`pnpm test` 全綠、`pnpm build` 乾淨

## 5. 驗收

- [x] 5.1 e2e：逾期的稽核紀錄被刪除，未逾期的留著
- [x] 5.2 ⭐ e2e：**未判定的檢舉即使很舊也不刪**
- [x] 5.3 ⭐ e2e：已判定且逾期的檢舉被刪除，**連同內容快照**
- [x] 5.4 e2e：已判定但未逾期的不刪
- [x] 5.5 ⭐ e2e：**清理後 `chat_messages` 的筆數不變**——這是 D1 的驗收
- [x] 5.6 **反向驗證**：把檢舉的條件改成 `created_at < cutoff` → 5.2 變紅
- [x] 5.7 驗證：`test:e2e` 全綠（**先導到檔案再 grep**）

## 6. 文件與收尾

- [x] 6.1 `openspec/project.md`：補上保留策略
- [x] 6.2 `openspec/project/backend-utilities.md`：保留策略的說明（新增一張表要清時該怎麼做）
- [x] 6.3 `smoke-test.md`：手動觸發清理並確認三件事（稽核清了、未判定的檢舉沒清、訊息沒動）
- [x] 6.4 跑完整驗證鏈並貼出實際輸出
- [x] 6.5 更新 `tasks/todo.md`：保留期限完成；**訊息保留獨立成待辦並註明卡在 seq 缺口的設計**
- [x] 6.6 新踩到的坑寫進 `tasks/lessons.md`
- [x] 6.7 `openspec archive add-chat-retention`。新增一支能力，記得補 Purpose
