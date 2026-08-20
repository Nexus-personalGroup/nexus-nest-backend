# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

- **M1 WS 地基**（尚未開工）：M0 已全數完成，下一步見「近期里程碑」的 M1。開工前先確認 `refactor/migrate-ci-to-github-actions` 已合併進 `develop`。

## 待辦

### 近期里程碑（nexus 專屬）

> Phase 1 只做即時聊天，做到 production 等級。前台另開專案，`apps/web` 為純後台管理。

- **M1 WS 地基**：連線、JWT 認證、Redis presence、`@socket.io/redis-adapter` 跨實例廣播、CLI 測試客戶端。驗收＝起兩個 API 實例，A 實例送出的訊息 B 實例的連線收得到。
- **M2 聊天核心**：房間、訊息、`clientMessageId` 去重、ack 確認、room 內自增 `seq`、斷線補齊。
- **M3 監控埋點**：Prometheus metrics + `chat_audit_log` + 管理員稽核表。**介面可以晚做，埋點不能晚做**——這類資料無法回溯補齊。
- **M4 後台介面**：SSE 即時儀表板、使用者 360 視圖、聊天室總覽、檢舉佇列與處置。

### 需人工處理（AI 做不到）

- **合併 `refactor/migrate-ci-to-github-actions` 到 `develop`**：Change 2 已實作、驗證、封存，但分支尚未合併。開 PR 合併的同時就是 GitHub Actions 的第一次實跑。

- **設定 branch protection**：GitHub repo → Settings → Branches，對 `develop` 與 `main` 把 `quality` 與 `e2e` 設為 required status checks。**沒設的話 CI 只會顯示紅燈、不會擋住合併**，`platform-ci-quality-gate` 的保證形同虛設。此設定不在版控內。

- **確認 pnpm store cache 是否命中**：首跑（2026-08-20）`quality` 與 `e2e` 皆於 PR 觸發、各約 1 分鐘通過，時長無需限縮。唯一未驗的是 cache —— 要進 run log 看 `actions/cache` 那步是 `Cache restored from key` 還是 `Cache not found`。第二次之後才有得比。

- **設定 branch protection 時三個 check 都勾**：`品質檢查` / `E2E` / `建置`。首跑時 `建置` 因 `if: github.event_name == 'push'` 在 PR 上是 skipped，已於同一支 PR 移除該條件——理由見 `openspec/project/tooling.md` 的 CI 段落。

### 觀察中（繼承自模板）

- **e2e 有間歇性失敗**：模板期間發生 2 次，皆重跑後全綠、無法重現。共同點是「緊接在另一個會寫檔案的指令之後的第一次執行」——懷疑與 ts-jest 快取或檔案 mtime 有關，未證實。**下次務必用 `test:e2e > /tmp/x.log 2>&1` 保留完整輸出**——前兩次都因為用 grep 管線過濾而沒留下失敗的測試名稱，這是查不下去的主因。

- **傳遞依賴漏洞（77 個）**：2026-08-20 轉 PostgreSQL 後重跑 `pnpm audit`，**數字與模板時期相同**——移除 `mysql2` 沒有減少任何一項，代表這些全都不在資料庫 driver 這條路徑上。分佈 5 low / 35 moderate / 35 high / 2 critical，多數深埋在 `apps/web > shadcn > @modelcontextprotocol/sdk` 與 `prisma` / `@nestjs/terminus` 的上游相依樹。**刻意不加 override 強制提版**——相容風險大於收益。追蹤方式：定期 `pnpm audit`，待上游更新後再評估。

### 延後功能（繼承自模板的預留）

- **帳號鎖定管理 CRUD（`add-account-lock-management`）**：後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`；前端 `/security/account-locks` 列表頁。沿用 SUPERADMIN role gate。**優先度低於 M1–M4**。

### 技術債（外部相依卡住，延後）

> **處理原則**：卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。現狀處置：api 已對齊 TS 6.0.2，`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

> 模板時期的變更歷史留在 `hexagonal-nest-express-mysql` repo，未帶入本專案。

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
