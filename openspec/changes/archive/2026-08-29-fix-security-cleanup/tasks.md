> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 塊 1（CSP）動到 `main.ts` 的全域中介層，要加 `pnpm --filter @app/api test:e2e`；
> 動到 module 接線的塊加 `pnpm build`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠，
> 還原後 `git diff` 要乾淨。
>
> **塊的依賴**：**五塊互相獨立**，可任意順序、也可只做其中幾塊。
> 綁在同一個 change 是因為 1 與 2 是同一個放大器的兩端（CSP × localStorage × 效期），
> 3、4、5 各自規模太小、不值得各開一次流程。
>
> **塊 4 的 4.1 是安全網，不可跳過**：`sendHeartbeats()` 目前沒有任何測試，
> 直接改會沒有東西告訴你續期行為壞了。先補 characterization test 釘住現行行為。
>
> **每塊綠燈後給一次 commit 指令，由使用者手動執行**，再進下一塊。
>
> **這個 change 沒有 schema 變動、沒有 migration。有一個環境變數改預設值（塊 2）。**

## 1. CSP 分路徑

- [x] 1.1 `main.ts` 抽出 `isDocsPath()`：命中 `/api/admin/docs` 與 `/api/front/docs`
      兩條前綴。**兩條都要**——漏掉一條的症狀是「那份文件打不開」，
      會被當成 Swagger 壞掉去查，沒有人會想到是 CSP
- [x] 1.2 ⭐ 建兩個 helmet 實例（預設 / 文件放寬），用單一分支中介層切換。
      **不可以用 `app.use(path, helmet(...))` 疊加**（design D1）：
      那只是「前綴符合才跑」，後面的 `app.use(helmet())` 照樣會把 CSP 加回去
- [x] 1.3 ⭐ 更新 `main.ts` 那段註解——原文的前提「純 API + 獨立前端」
      在單一埠部署模式加入時就失效了。新註解要寫**為什麼豁免只到文件路徑**
- [x] 1.4 ⭐ **MUST NOT 用 `NODE_ENV` 決定**（design D1）：開發與正式跑不同的 CSP，
      等於把違規延到正式環境才發現
- [x] 1.5 e2e：一般 API 路徑有 `Content-Security-Policy` header；兩條文件路徑都已放寬。
      **實作時發現 `createE2EApp` 不套 `main.ts` 的中介層**——照原訂寫法這支 e2e
      會驗不到任何 header（空測試）。因此把安全標頭抽成
      `infrastructure/security-headers.ts`，`main.ts` 與 `createE2EApp` 共用同一支。
      注意 e2e 驗的是**中介層的分支**：測試 app 不掛 Swagger 路由，
      文件路徑實際是 404，只是仍走到放寬那一支。「UI 真的渲染得出來」屬於 6.2 的人工項
- [x] 1.6 ⭐ 反向驗證：改回 `helmet({ contentSecurityPolicy: false })` → 1.5 要紅；
      只保留 admin 那條文件路徑（漏掉 front）→ front 那條要紅。兩者還原後都要綠
- [x] 1.7 驗證：`pnpm typecheck && pnpm lint && pnpm test` 與
      `TZ=UTC pnpm --filter @app/api test:e2e` 皆 exit 0

## 2. refresh token 效期

- [x] 2.1 `validate-env.ts`：`REFRESH_TOKEN_EXPIRES_IN` 預設 604800 → 86400
- [x] 2.2 `.env.example` 同步（**不要碰 `.env`**——那是使用者的檔案）
- [x] 2.3 ⭐ 產一份無點暫存檔（`env.diff` 之類）列出使用者要手動改的行，
      提醒他複製後刪掉
- [x] 2.4 單元測試：未設定時取到 86400
- [x] 2.5 ⭐ 反向驗證：改回 604800 → 2.4 要紅；還原後綠
- [x] 2.6 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0

## 3. Redis fail-open 可觀測

- [x] 3.1 `MetricsPort` 增加降級計數器（區分 login / ip 兩條路徑）
- [x] 3.2 ⭐ `PrismaAccountLockAdapter.recordFailedLogin` 與
      `recordFailedIpAttempt` 在 `!redis.isAvailable` 時 `logger.warn` + 遞增指標。
      **兩條都要**——只做其中一條的話，另一條依然是靜默的
- [x] 3.3 ⭐ **放行行為不變**（design D3）：仍然回 0、仍然不阻塞登入。
      這一塊只補痕跡，不推翻 graceful degradation
- [x] 3.4 單元測試：Redis 不可用 → 有 warn 且指標 +1 且仍回 0；
      Redis 可用 → **沒有** warn、指標不動
- [x] 3.5 ⭐ 反向驗證：拿掉 warn → 3.4 要紅；拿掉指標 → 3.4 要紅。還原後綠
- [x] 3.6 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0

## 4. 心跳防重入與批次

- [x] 4.1 ⭐ **安全網，不可跳過**：先補 `sendHeartbeats()` 的 characterization test
      釘住現行行為。**先綠了才動 production code**（6/6 對著逐條實作跑過）。
      斷言刻意寫成**機制無關**（`renewals()` 同時讀 `heartbeat` 與 `heartbeatMany`），
      因此改成批次後同一組測試仍然成立——反向驗證 J 把實作改回逐條時，
      這幾條照樣綠，那正是安全網該有的樣子
- [x] 4.2 `PresencePort` 增加 `heartbeatMany(entries)`；
      adapter 內用 pipeline 把 N 組 `hSet + expire` 合成一次往返
- [x] 4.3 ⭐ 走 port，**不讓 gateway 直接拿 Redis client**（design D4）——
      那會穿透分層，而 `layering.spec.ts` 也會擋
- [x] 4.4 ⭐ `ChatGateway` 加 in-flight 旗標：上一輪未完成則**直接跳過**本輪。
      **不是排隊等**（design D4）——排隊是堆疊的另一種寫法。
      旗標的重置要放 `finally`，否則單次拋出會讓心跳永久停擺
- [x] 4.5 ⭐ **防重入與批次是兩件事，都要做**：批次讓單輪變快，
      但變快不等於不會超時（Redis 延遲抬高時照樣會）。旗標才是保證的來源
- [x] 4.6 單輪耗時加指標——「還有多少餘裕」不該靠猜
- [x] 4.7 單元測試：上一輪未完成時下一輪跳過；前一輪完成後恢復執行；
      批次中單條失敗時其餘仍完成且該輪正常結束
- [x] 4.8 ⭐ 反向驗證：拿掉旗標 → 跳過那條要紅；
      把旗標重置從 `finally` 移出再讓單輪拋出 → 「恢復執行」那條要紅。還原後綠
- [x] 4.9 驗證：`pnpm typecheck && pnpm lint && pnpm test` 與 `pnpm build` 皆 exit 0

## 5. 文件漂移

- [x] 5.1 ⭐ 新守則 `guardrail-inventory`：斷言 `test/architecture/*.spec.ts`
      的數量**不低於**基準值。**只擋變少**（design D5）——
      要求精確相等的規則每加一條守則就要改一次期望值，會被當成雜訊繞過
- [x] 5.2 `CLAUDE.md` 兩處（第 168、184 行附近）拿掉「11 rule files / 32 assertions」，
      改成不帶數字的描述
- [x] 5.3 `CLAUDE.md` 第 168 行附近：e2e 的前置從「needs local MySQL」改成 PostgreSQL
      （專案 2026-08-20 已轉 PG），並補上「本機要先起 DB 容器」
- [x] 5.4 `openspec/project/backend-runtime.md` 第 11 行附近：
      補上 refresh token 也存 `localStorage`——目前只寫了 access token
- [x] 5.5 `logger.ts` 兩處註解：(a) 「App 建立後改用 `app.get('fastify').log`」
      是錯的，專案用 Express（`NestExpressApplication`）；
      (b) 直讀 `process.env` 是**刻意的**（logger 初始化早於 `getEnv()`），
      要寫清楚，否則下一個人會「修好」它並引入循環相依
- [x] 5.6 ⭐ 反向驗證：把 `test/architecture/` 底下任一守則檔暫時移走 → 5.1 要紅；
      放回去要綠
- [x] 5.7 驗證：`pnpm test` exit 0

## 6. 收尾

- [x] 6.1 跑完整驗證鏈並**貼出實際 exit code**
- [x] 6.2 `smoke-test.md`：⭐ 含**只有人工驗得到的**——CSP 上線後
      實際打開後台走一輪（登入 → 列表 → 編輯 → 登出），確認沒有資源被擋。
      e2e 只驗得到 header 存在，驗不到「頁面還能不能用」
- [x] 6.3 ⭐ 補 `platform-public-surface` 與 `platform-token-scope` 的 `## Purpose`
      ——目前兩支都還是 archive 留下的 `TBD - created by archiving change ...`
- [x] 6.4 更新 `tasks/todo.md`：第 7 項打勾；順手把第 6 項從「待合併」改成「已合併（#26）」
- [x] 6.5 ⭐ todo 的「已知缺口」補一條：審查報告的問題 10（WS 連線數 TOCTOU）
      本次刻意不做，記下理由
- [x] 6.6 新踩到的坑寫進 `tasks/lessons.md`
- [x] 6.7 ⭐ **列出需要使用者手動執行的**：改 `.env` 的
      `REFRESH_TOKEN_EXPIRES_IN`（塊 2）、CSP 上線後觀察後台是否有資源被擋
- [x] 6.8 `openspec archive fix-security-cleanup`，
      並檢查五支 master spec 的 `## Purpose` 有沒有跟新的 Requirements 打架
