# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

- **M1 收尾**：`add-websocket-foundation` 已實作並驗證完畢（unit 314 / 護欄 79 / e2e 151 / integration 11），尚待封存與合併 `feat/websocket-foundation` → `develop`。

## 待辦

### 近期里程碑（nexus 專屬）

> Phase 1 只做即時聊天，做到 production 等級。前台另開專案，`apps/web` 為純後台管理。
> M0 骨架、M1 WS 地基已完成，見「已完成」。

- **M2 聊天核心**：房間、訊息、`clientMessageId` 去重、ack 確認、room 內自增 `seq`、斷線補齊。**開工前必須先解決下方的事件契約前綴問題。**
- **M3 監控埋點**：Prometheus metrics + `chat_audit_log` + 管理員稽核表。**介面可以晚做，埋點不能晚做**——這類資料無法回溯補齊。
- **M4 後台介面**：SSE 即時儀表板、使用者 360 視圖、聊天室總覽、檢舉佇列與處置。

### 需決定（M2 開工前）

- **WebSocket 事件契約要放哪個能力前綴**：`openspec-spec-format.spec.ts` 只認 `api-` / `ui-` / `platform-`，且 `api-*` **強制**每個需求寫出 HTTP 請求與回應 JSON。WS 事件沒有 status code，硬套會寫出假的東西。M1 的連線層契約用 `platform-websocket-transport` 名副其實，但 M2 有真正的事件契約（`sendMessage` 的 payload 形狀、ack 回應、錯誤碼），`platform-` 就不合適了。兩條路：新增 `ws-` 前綴並改守則，或放寬 `api-*` 的格式要求以涵蓋非 HTTP 契約。**不解決的話 M2 的事件契約沒有地方可寫。**

### 需人工處理（AI 做不到）

- **設定 branch protection**：GitHub repo → Settings → Branches，對 `develop` 與 `main` 把 `品質檢查` / `E2E` / `建置` 三個 check 都設為 required status checks。**沒設的話 CI 只會顯示紅燈、不會擋住合併**，`platform-ci-quality-gate` 的保證形同虛設。此設定不在版控內，fork 或重建 repo 後要重設。

> **env 檔的協作方式**：`apps/api/.env` 與 `.env.example` 在 AI 的權限設定中被拒絕存取。
> 需要改動時由 AI 產生 `apps/api/env` / `env.example`（無點，可寫入），使用者複製過去後刪除暫存檔。
> **`.gitignore` 只擋 `.env*`，沒有點的 `env` 不在名單內**——暫存的 `env` 含真實金鑰，複製完務必刪掉。

### 觀察中

- **e2e 有間歇性失敗**（繼承自模板）：模板期間發生 2 次，皆重跑後全綠、無法重現。共同點是「緊接在另一個會寫檔案的指令之後的第一次執行」——懷疑與 ts-jest 快取或檔案 mtime 有關，未證實。**下次務必用 `test:e2e > /tmp/x.log 2>&1` 保留完整輸出**——前兩次都因為用 grep 管線過濾而沒留下失敗的測試名稱，這是查不下去的主因。

- **整合測試在 CI 尚未跑過**：`test:integration` 目前只在本機驗證過（同一 process 起多個實例 + 真 Redis）。CI 的 workflow 還沒把它加進去，加之前要先確認 runner 上多實例佔埠與 Redis service 的行為。**在此之前，跨實例廣播沒有自動化把關。**

- **傳遞依賴漏洞（77 個）**：2026-08-20 轉 PostgreSQL 後重跑 `pnpm audit`，**數字與模板時期相同**——移除 `mysql2` 沒有減少任何一項，代表這些全都不在資料庫 driver 這條路徑上。分佈 5 low / 35 moderate / 35 high / 2 critical，多數深埋在 `apps/web > shadcn > @modelcontextprotocol/sdk` 與 `prisma` / `@nestjs/terminus` 的上游相依樹。**刻意不加 override 強制提版**——相容風險大於收益。追蹤方式：定期 `pnpm audit`，待上游更新後再評估。

### 延後功能（繼承自模板的預留）

- **帳號鎖定管理 CRUD（`add-account-lock-management`）**：後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`；前端 `/security/account-locks` 列表頁。沿用 SUPERADMIN role gate。**優先度低於 M2–M4**。

### 技術債（外部相依卡住，延後）

> **處理原則**：卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。現狀處置：api 已對齊 TS 6.0.2，`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

> 模板時期的變更歷史留在 `hexagonal-nest-express-mysql` repo，未帶入本專案。

### 2026-08-20 — M1 WebSocket 地基（`add-websocket-foundation`）

**驗收條件達成**：起兩個 API 實例，A 實例送出的群組事件 B 實例的連線收得到——eden 跑了很久都證明不了這件事，現在有一條會失敗的測試守著（`test/integration/ws-cross-instance.integration-spec.ts`，11 條）。

**刻意避開 eden 的四個坑**：presence 從記憶體 Map 改為 Redis Hash + 心跳（實例被 kill 後紀錄自動失效）、裝上 `@socket.io/redis-adapter`、gateway 只做轉譯（由守則強制）、WS 認證與 HTTP 共用同一份 `ResolveMemberContextUseCase`。最後一項尤其關鍵——eden 為 WS 重寫了一份判定邏輯並漏掉 `tokenVersion` 比對，導致強制登出對 WS 連線無效，且沒有任何徵兆。

**補了三條守則**（68 → 79 項）：既有規則對 WS 層有系統性的涵蓋缺口——`layering.spec.ts` 只 filter `*Controller.ts`、`dto-from-zod` 與 `authorization-coverage` 只掃 `adapter/in/web`。規則都存在、都正確，只是看不到新的進入點。**eden 那個 544 行的肥 gateway 原本可以在這裡原封不動重演一次，一路綠燈。**

**整合測試抓到一個 production bug**：`NestFactory.create()` 不跑 `onModuleInit`，而 WS adapter 必須在 `app.listen()` 之前掛上——`main.ts` 有一模一樣的問題，只是還沒人啟動過 dev server。單元測試與 e2e 都驗不到（e2e mock 掉 Redis、也不掛 adapter）。

**新增測試層**：`test/integration/`，用真 Redis 起多個實例。與 e2e 的前置條件相反，因此獨立成一套 jest 設定。

**M1 不含**：訊息、房間、已讀、ack、去重、斷線補齊（M2）；監控埋點（M3）。

### 2026-08-20 — M0 專案骨架

從 `hexagonal-nest-express-mysql` 模板衍生出 nexus 後端，兩支 change 走完 propose → apply → archive。

**`refactor-switch-to-postgres`** — MySQL/MariaDB → PostgreSQL 17。六角架構把資料庫關在 `adapter/out/persistence` 與 `infrastructure/prisma` 之內，`application` 與 `domain` 兩層零改動，這是「現在換」可行的原因。

三件事只有做了才會發現：

- **PostgreSQL 的 `DELETE` 不支援 `LIMIT`** —— 日誌清理的分批刪除會直接爆，改走 `ctid IN (SELECT … LIMIT n)`。反向驗證（把 `<` 改成 `>`）確認 3 支 e2e 真的變紅，證明測試在驗 SQL 本身而非只是跑過。
- **容器 healthcheck 必須用 `pg_isready`** —— 官方映像初始化期間會先起一次臨時伺服器，只探行程或埠會誤判為就緒。已寫成 `platform-container-dev` 的需求。
- **`compose-files.spec.ts` 擋下了我** —— 它要求 compose 的對外埠必須寫進 README，把文件變成鏈式依賴而非事後補。

順帶把 UTC 保證從 driver 參數（`timezone: 'Z'`）移到欄位層 `@db.Timestamptz(3)`：前者寫在 `PrismaService` 建構子裡，改連線設定時漏掉那行就靜默失效；後者由 schema 保證。並補上 11 表 / 69 欄位的 `///` 描述 + `COMMENT ON`，新增 `gen:comments` 產生器避免兩邊漂移。

**`refactor-migrate-ci-to-github-actions`** — CI 從沒人執行的 GitLab 設定搬到 GitHub Actions。6 個 job 砍成 3 個：`npm-install`、`cleanup`、`pr_agent` 都是為了繞過 GitLab 限制而存在，在 GitHub 上沒有意義。最有價值的是**移除 15 行的等待迴圈**——GitHub Actions 的 service container 支援 healthcheck，CI 與本機從此共用同一套 `pg_isready` 判定，原本「兩套各自會出錯的機制」消失。順手刪掉 `scripts/init-project.sh`（模板衍生腳本，第 3 步是 `rm -rf .git`，在此只有誤執行毀掉歷史的風險）。

**驗收**：`docker:deps` / `db:migrate` / `typecheck` / `lint` / `test`（單元 281 + 護欄 68）/ `build` 六項全綠，e2e 151 支對真實 PostgreSQL 通過。

**本輪解決的模板遺留待辦**：`.env.example` 補 `ALLOW_PROD_SEED`（已隨 PostgreSQL 設定一併重寫）。
