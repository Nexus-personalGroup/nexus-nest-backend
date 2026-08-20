# AI 工具、CI 與指令參考

> .agents/hooks 的設計、GitLab CI 各 job 職責，以及完整的 per-workspace 指令參考。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## AI 工具設定（`.agents/`）

hook 的**邏輯**放在工具無關的 `.agents/hooks/*.sh`，各家 AI 的設定只負責「註冊」呼叫。

```
.agents/hooks/
├── check-typescript.sh          # PostToolUse：對剛改的單一 .ts 跑該 workspace 的 eslint
├── check-prisma-schema.sh       # PostToolUse：schema.prisma 異動 → 提醒 migrate / generate / 連動檔
├── check-domain-exception.sh    # PostToolUse：新增 exception → 提醒補 code + 訊息（成對）
└── check-swagger-artifacts.sh   # Stop：改了來源 yaml 但產物沒重生 → exit 2 擋下
```

為什麼不放 `.claude/`：這些檢查（產物是否過期、schema 是否要 migrate）本質上與 AI 工具無關，git pre-commit 或其他 agent 也該能用。script 以 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` 取得專案根目錄，不相依特定工具。

**新增 hook 的作法**：寫 `.agents/hooks/<name>.sh`（檔頭註明用途 / 觸發時機 / exit code 語意）→ 在 `.claude/settings.json` 註冊 → 架構測試 `hook-scripts.spec.ts` 會自動以 `bash -n` 檢查語法，並驗證「settings.json 註冊的 script 都存在」。

**exit code 語意**：`0` 通過；`2` 在 Stop hook 代表阻止結束並把 stderr 回饋給 AI。用 `2` 要保守——誤判會讓人無法收工，判斷條件寧可漏判也不要誤擋。

`AGENTS.md` 是 `CLAUDE.md` 的 symlink，讓讀 `AGENTS.md` 慣例的工具（Codex 等）拿到同一份規則。

---

## CI（GitLab）

`.gitlab-ci.yml` 的 stages：`prepare → quality → optimize → cleanup → pr_agent`。

| Job | Stage | 做什麼 | 對應本機指令 |
| --- | --- | --- | --- |
| `npm-install` | prepare | `pnpm install --frozen-lockfile` | `pnpm install` |
| `quality-check` | quality | 型別 / lint / 單元測試 + **覆蓋率門檻** + 架構守則 | `pnpm typecheck && pnpm lint && pnpm test:cov` |
| `e2e-test` | quality | 對 `mysql:9` service container 跑完整 e2e | `pnpm --filter @app/api test:e2e` |
| `prepare-production` | optimize | Prisma generate + build（**需 `quality-check` 通過**） | `pnpm build` |

**本機重現 CI 的測試環境**：`pnpm verify:ci` 以 `docker compose --profile verify` 起一個 MySQL 9 容器（healthcheck 等就緒、`tmpfs` 跑在記憶體）並執行 e2e，實測約 60 秒。定位是「測試環境重現」而非「pipeline 模擬」——runner 行為與 cache 命中仍只能在實際 pipeline 觀察。

### 容器化（單一 `compose.yml`）

三種用法靠「指定服務」與 profile 區分，不需要多份檔案：

| 指令 | 起什麼 | 用途 |
| --- | --- | --- |
| `pnpm docker:up` | api + web + mysql + redis | 整套跑在容器裡，原始碼 bind mount + 熱重載 |
| `pnpm docker:deps` | mysql + redis | 只要資料庫，api / web 跑在 host |
| `pnpm verify:ci` | mysql-verify（`--profile verify`） | 重現 CI e2e 環境，跑完即 `down -v` |

`mysql-verify` 獨立成一個服務而非共用開發用的那個，因為兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它掛在 profile 底下，
平常的 `up` 不會啟動它。兩者與 CI 的 service 共用 `mysql:9` 同一條版本線，
避免「本機過、CI 掛」。

對外埠一律避開預設的 3306 / 6379（多數開發機已有一組資料庫在跑），
可用 repo 根目錄 `.env` 的 `APP_API_PORT` / `APP_WEB_PORT` / `DEV_DB_PORT` /
`DEV_REDIS_PORT` / `DEV_DB_PASSWORD` 覆寫。

#### 容器化開發的六個非顯而易見之處

這些都是實測踩出來的，改 `compose.yml` 或 `Dockerfile` 前先看過：

1. **Node 版本看 `packageManager` 不是 `engines`**——pnpm 11 需要 Node ≥ 22.13，
   用 node:20 會在 `pnpm install` 當場失敗（缺 `node:sqlite` 內建模組）。
2. **`node_modules` 五個位置都要用 volume 蓋掉**——pnpm 的 workspace `node_modules`
   是指向根目錄 `.pnpm` store 的 symlink，漏任一個就會載到 host 的 macOS/arm64 產物
   （症狀：bcrypt 或 Prisma 引擎 invalid ELF header）。用具名 volume 而非匿名，
   否則 Docker Desktop 清單裡十個隨機 hash 無從辨識。
3. **host 的 `apps/api/.env` 會被 bind mount 帶進容器**，而 dotenv 不覆寫既有的
   `process.env`——等於「compose 沒設的都由開發者本機補」。用 `docker/api.container.env`
   遮掉，設定才只有 compose 與 envSchema 預設兩個來源。
4. **api 不能用 `nest start --watch`**——重啟時舊行程還在跑 `enableShutdownHooks` 的
   優雅關閉（Prisma pool + Redis quit），新行程搶埠失敗直接死，症狀是**編譯成功但
   改動不生效**，log 完全正常。改為 `nest build --watch` + `node --watch` 兩段，
   並用 `nest-cli.docker.json` 關掉 `deleteOutDir`（否則 rebuild 清空 dist 的空窗期
   會讓 `node --watch` MODULE_NOT_FOUND 後放棄）。
5. **bind mount 不傳遞 inotify 事件**（macOS）——看 host 改動的 watch 必須輪詢：
   tsc 用 `TSC_WATCHFILE`、Vite 用 `server.watch.usePolling`。反過來，容器**自己**
   寫出的檔案（`dist`）事件是通的，不必輪詢。
6. **容器只綁 IPv4，`localhost` 在 macOS 優先解析 IPv6**——機器上若有別的服務綁在
   `::1:5173`，用 `localhost` 會連到它。文件一律寫 `127.0.0.1`。

**改了依賴後具名 volume 不會自動更新**：volume 只在第一次建立時從映像複製內容，
之後即使重建映像也沿用舊的。改 `package.json` / lockfile 後用 `pnpm docker:renew`
——它只砍 `node_modules` 的 volume 再重建，**不動 `mysql-data` / `redis-data`**。
`docker:reset`（`down -v`）會移除專案的**所有** volume 含資料庫，之後得重跑 `docker:init`。

要點：

- **兩個品質 job 在 Merge Request 就觸發**（不像 `prepare-production` 只認分支推送）—— MR 正是最該擋下問題的時機。
- `quality-check` 與 `e2e-test` 同 stage 平行執行；前者不需外部服務，多數問題數十秒內回報。
- e2e 的 DB 連線走 **job variables**，不在 CI 偽造 `.env`：`applyE2EDbEnv()` 以 dotenv 載入 `.env`，而 **dotenv 不覆寫既有 `process.env`**，因此 CI 供應的變數優先生效。
- `DB_TEST_DATABASE` 必須含 `test`，否則 e2e 的 globalSetup 守門會中止（防誤連 dev / prod）。
- `git commit --no-verify` 可繞過 husky pre-commit，但繞不過 CI —— 這是把關的最後一道。
- **覆蓋率門檻只有 `test:cov` 會執行**（`test` 不帶 coverage，供開發時快速回饋）。兩個 workspace 都設有門檻：api 70/60/70/70、web 75/75/60/75；新增設有門檻的 workspace 時**必須提供 `test:cov`**，否則會被 `pnpm -r test:cov` 靜默略過。
- `apps/api` 的 `test:cov` 刻意串接架構測試（`jest --coverage && jest --config test/jest.arch.config.js`）—— 只寫 `jest --coverage` 會讓 CI 換用 `test:cov` 後靜默漏掉整組架構守則。

> **不使用 GitLab CI 的專案**：上表「對應本機指令」欄即為等價檢查，請在自己的 CI 平台上照樣執行；否則所有架構守則與測試都只在開發者本機生效。

---

## 完整指令參考

套件管理：**pnpm 11+**（root 透過 `packageManager` 欄位 + corepack 自動鎖版本）。

### Root 跨 workspace

```bash
pnpm install                 # 一次裝完所有 workspace 依賴
pnpm dev                     # concurrently 啟動 apps/api + apps/web
pnpm build                   # 依序 build apps/api → apps/web（api-client source-first，無 build）
pnpm typecheck               # 三個 workspace 全部 tsc --noEmit
pnpm lint                    # 三個 workspace 全部 eslint
pnpm test                    # 跑各 workspace 的 test script

# 容器化（單一 compose.yml，詳見上方「容器化」）
pnpm docker:up               # 整套跑在容器裡（api + web + mysql + redis）
pnpm docker:init             # 容器內建表 + seed（首次一次）
pnpm docker:logs             # 跟蹤 api / web
pnpm docker:deps             # 只起 mysql + redis，api / web 跑在 host
pnpm docker:down             # 停止，資料保留
pnpm docker:renew            # 改依賴後：只重建 node_modules volume，資料保留
pnpm docker:reset            # 刪除所有 volume（含 DB / Redis 資料）
pnpm verify:ci               # 重現 CI 的 e2e 環境跑一次
```

### 後端 `apps/api`

```bash
# 開發
pnpm --filter @app/api dev               # watch 模式
pnpm --filter @app/api start:debug       # debug + watch
pnpm --filter @app/api build             # nest build → apps/api/dist
pnpm --filter @app/api start:prod        # 啟動 build 產物

# 程式碼品質
pnpm --filter @app/api lint
pnpm --filter @app/api lint:fix
pnpm --filter @app/api format

# 測試
pnpm --filter @app/api test              # 單元測試 (*.spec.ts)
pnpm --filter @app/api test:watch
pnpm --filter @app/api test:cov
pnpm --filter @app/api test:e2e          # E2E（需 MySQL + Redis）

# 資料庫（一律在 apps/api 工作目錄執行）
pnpm --filter @app/api db:create
pnpm --filter @app/api db:drop
pnpm --filter @app/api db:migrate              # 開發環境（含 generate）
pnpm --filter @app/api db:migrate:deploy       # 生產環境部署
pnpm --filter @app/api db:generate             # 僅產生 Prisma client（搬 monorepo 後第一次 typecheck 必跑）
pnpm --filter @app/api db:seed
pnpm --filter @app/api db:studio

# Swagger
pnpm --filter @app/api swagger:bundle    # 合併分檔 yaml → openapi.bundle.yaml
```

### 前端 `apps/web`

```bash
pnpm --filter @app/web dev               # Vite dev server (5173, proxy /api → :3000)
pnpm --filter @app/web build             # tsc -b && vite build → apps/web/dist
pnpm --filter @app/web typecheck
pnpm --filter @app/web lint
pnpm --filter @app/web preview           # 預覽生產 build

# 加 shadcn 元件（要在 apps/web 工作目錄）
cd apps/web && pnpm dlx shadcn@latest add <component>
```

### API client `packages/api-client`

```bash
# 後端 controller / Swagger 改動後同步型別
pnpm --filter @app/api swagger:bundle
pnpm --filter @app/api-client generate   # openapi.bundle.yaml → src/schema.ts

pnpm --filter @app/api-client typecheck  # source-first，無 build
```
