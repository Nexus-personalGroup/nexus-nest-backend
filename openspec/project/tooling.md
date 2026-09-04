# AI 工具、CI 與指令參考

> .agents/hooks 的設計、GitHub Actions 各 job 職責，以及完整的 per-workspace 指令參考。

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

## CI（GitHub Actions）

`.github/workflows/ci.yml`，觸發於對 `develop` / `main` 的 Pull Request 與推送。

| Job | 做什麼 | 對應本機指令 |
| --- | --- | --- |
| `quality` | 型別 / lint / 單元測試 + **覆蓋率門檻** + 架構守則 | `pnpm typecheck && pnpm lint && pnpm test:cov` |
| `e2e` | 對 `postgres:17` service container 跑完整 e2e（Redis 於測試中 mock） | `pnpm --filter @app/api test:e2e` |
| `integration` | 起兩個 API 實例 + **真 Redis**，驗證跨實例廣播 | `pnpm --filter @app/api test:integration` |
| `build` | Prisma generate + build（**`needs: [quality]`**） | `pnpm build` |

`e2e` 與 `integration` 刻意不列入 `build` 的 `needs`——它們較慢，不該阻塞產出，但失敗仍會使整個 workflow 失敗。

**`integration` 與 `e2e` 分開而非併成一個 job，因為兩者的前置條件相反**：e2e 把 Redis mock 掉
（它驗的是單一實例內的 API 行為，真 Redis 只會多一個不穩定來源）；integration 必須用真 Redis
——跨實例廣播完全建立在 pub/sub 之上，mock 掉就沒東西可驗。併在一起還會讓兩套 jest 設定
在同一個 process 內切換，mock 與真連線打架。

`integration` 是 CI 中**唯一需要 Redis 的 job**。沒有它的話，拿掉 `@socket.io/redis-adapter`
或改壞它的掛載時機，CI 一樣全綠——那類失效在單一實例內完全看不出來。

四個 job 的前置步驟（Node + pnpm + 快取 + 安裝）抽在 `.github/actions/setup-workspace`，
理由與 `compose.yml` 的 `x-app-base` anchor 相同：複製出去的設定必然漂移。
Node 版本取自 `.nvmrc`、pnpm 版本取自 `package.json` 的 `packageManager`，
CI 不另外宣告版號。

**資料庫就緒判定與本機同一套**：service container 用 `--health-cmd "pg_isready …"`，
與 `compose.yml` 的 `postgres` / `postgres-verify` 完全一致。
不可改用固定秒數或 TCP 輪詢——PostgreSQL 官方映像初始化時會先起一次臨時伺服器，
埠已開但尚未接受正式連線，探埠會誤判為就緒。

> ⚠️ **CI 通過與否目前不會擋住合併，而且現階段無法設定。**
>
> GitHub 的 status check 預設只顯示結果，要擋合併必須設 branch protection 或 ruleset。
> 但本 repo 是 **Free 方案下的私有 organization repo**，兩者皆回 403
> （`Upgrade to GitHub Pro or make this repository public`）。
>
> 也就是說 `platform-ci-quality-gate` 的「品質未通過不得進入建置階段」在這個 repo 上
> **只有 job 相依（`build` needs `quality`）那一半成立**，人為 merge 的那一半不成立。
> 解除限制的途徑：把 repo 改為 public、或升級付費方案。在那之前這是知情的缺口，
> 不是忘記設定。

**本機重現 CI 的測試環境**：`pnpm verify:ci` 以 `docker compose --profile verify` 起一個 PostgreSQL 17 容器（healthcheck 等就緒、`tmpfs` 跑在記憶體）並執行 e2e，實測約 60 秒。定位是「測試環境重現」而非「pipeline 模擬」——runner 行為與 cache 命中仍只能在實際 pipeline 觀察。

### 容器化（單一 `compose.yml`）

四種用法靠「指定服務」與 profile 區分，不需要多份檔案：

| 指令 | 起什麼 | 用途 |
| --- | --- | --- |
| `pnpm docker:up` | api + web + postgres + redis + nginx | 整套跑在容器裡，原始碼 bind mount + 熱重載 |
| `pnpm docker:deps` | postgres + redis | 只要資料庫，api / web 跑在 host |
| `pnpm verify:ci` | postgres-verify（`--profile verify`） | 重現 CI e2e 環境；測試行程跑在 host |
| `pnpm test:e2e:docker` | postgres-verify + e2e（`--profile e2e`） | **測試行程也跑在容器內**，不依賴 host 的 Node / 套件 / `.env` |

`pnpm docker:up` 另會起 **nginx**（`${APP_PROXY_PORT:-8080}`）作為單一入口：
`/api` 與 `/socket.io` 給 api、其餘給 web。**api 與 web 沒有發布對外埠，
代理是容器模式唯一的進入方式**——留一條直連的備援會讓「單一 origin」變成可選的，
而且代理設定漂掉時沒有人會發現。要直連改跑 `pnpm docker:deps` + `pnpm dev`。

有代理就**必須同時設 `TRUST_PROXY`**，否則 IP 黑名單、登入失敗計數與全域節流
會把所有請求當成同一個來源，而且不會有任何錯誤訊息。

**收尾一律用 `rm -fsv <服務>` 而不是 `down -v`**：後者的 `-v` 移除的是
**專案的所有 named volume**，包含 `postgres-data`、`redis-data` 與五個
`node_modules` volume——等於每跑一次測試就清掉開發環境，
而症狀是下一次啟動時「找不到 `.prisma/client`」或「資料庫是空的」，
完全指不到是那一行造成的。

`postgres-verify` 獨立成一個服務而非共用開發用的那個，因為兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它掛在 profile 底下，
平常的 `up` 不會啟動它。兩者與 CI 的 service 共用 `postgres:17` 同一條版本線，
避免「本機過、CI 掛」。

對外埠一律避開預設的 5432 / 6379（多數開發機已有一組資料庫在跑），
可用 repo 根目錄 `.env` 的 `APP_PROXY_PORT` / `DEV_DB_PORT` /
`DEV_REDIS_PORT` / `DEV_DB_PASSWORD` 覆寫。

#### 容器化開發的六個非顯而易見之處

這些都是實測踩出來的，改 `compose.yml` 或 `Dockerfile` 前先看過：

1. **Node 版本看 `packageManager` 不是 `engines`**——pnpm 11 需要 Node ≥ 22.13，
   用 node:20 會在 `pnpm install` 當場失敗（缺 `node:sqlite` 內建模組）。
2. **`node_modules` 五個位置都要用 volume 蓋掉**——pnpm 的 workspace `node_modules`
   是指向根目錄 `.pnpm` store 的 symlink，漏任一個就會載到 host 的 macOS/arm64 產物
   （症狀：bcrypt 或 Prisma 引擎 invalid ELF header）。用具名 volume 而非匿名，
   否則 Docker Desktop 清單裡十個隨機 hash 無從辨識。
3. **容器的設定優先序是四層**：`compose 的 environment` > `apps/api/.env`
   （由 `env_file` 讀入，`required: false`）> `docker/api.container.env`
   （bind mount 遮蔽容器內同名檔）> `envSchema` 預設。
   「compose 沒設的由開發者本機補」是**刻意的**——但連線類變數
   （`*_HOST` / `*_PORT` / `*_URL`）必須在 compose 釘死，否則 host 的
   `localhost` 位址會漏進容器；`REDIS_URL` 尤其要釘成**空字串**，因為連線工廠是
   `URL ? url : {host, port}`，釘成非空值反而會蓋掉 `REDIS_HOST`。
   守則 `compose-files.spec.ts` 會擋住新增時漏釘。
4. **api 不能用 `nest start --watch`**——重啟時舊行程還在跑 `enableShutdownHooks` 的
   優雅關閉（Prisma pool + Redis quit），新行程搶埠失敗直接死，症狀是**編譯成功但
   改動不生效**，log 完全正常。改為 `nest build --watch` + `node --watch` 兩段，
   並用 `nest-cli.docker.json` 關掉 `deleteOutDir`（否則 rebuild 清空 dist 的空窗期
   會讓 `node --watch` MODULE_NOT_FOUND 後放棄）。

   ⚠️ **容器在跑的時候，host 不要跑 `pnpm build`。** host 的 `nest build` 用的是
   `nest-cli.json`（`deleteOutDir` 沒關），會清空 `apps/api/dist`——**那是 bind mount**，
   容器的 `node --watch dist/main` 當場 `MODULE_NOT_FOUND` 然後停在
   「Waiting for file changes」。而 `nest build --watch` 只在**原始碼**變動時才重建，
   dist 被外部刪掉不算，所以**它不會自己回來**。
   症狀是畫面上的 nginx `502 Bad Gateway`，而 api 容器顯示 `unhealthy`。
   修法：`docker compose restart api`。
   ⚠️ 這個組合會固定重現——`pnpm build` 就寫在 Pre-Change Checklist 裡。
5. **bind mount 不傳遞 inotify 事件**（macOS）——看 host 改動的 watch 必須輪詢：
   tsc 用 `TSC_WATCHFILE`、Vite 用 `server.watch.usePolling`。反過來，容器**自己**
   寫出的檔案（`dist`）事件是通的，不必輪詢。
6. **容器只綁 IPv4，`localhost` 在 macOS 優先解析 IPv6**——機器上若有別的服務綁在
   `::1:5173`，用 `localhost` 會連到它。文件一律寫 `127.0.0.1`。

**改了依賴後具名 volume 不會自動更新**：volume 只在第一次建立時從映像複製內容，
之後即使重建映像也沿用舊的。改 `package.json` / lockfile 後用 `pnpm docker:renew`
——它只砍 `node_modules` 的 volume 再重建，**不動 `postgres-data` / `redis-data`**。
`docker:reset`（`down -v`）會移除專案的**所有** volume 含資料庫，之後得重跑 `docker:init`。

要點：

- **四個 job 都在 Pull Request 觸發** —— PR 正是最該擋下問題的時機。`build` 尤其不能只在推送時跑：`nest build` / `vite build` 會抓到 path alias 解析、decorator metadata 與 emit 階段的錯誤，這些 `tsc --noEmit` 抓不到；只在 push 跑等於「PR 綠燈、合併完 develop 才紅」。
- `quality` / `e2e` / `integration` 平行執行；`quality` 不需外部服務，多數問題數十秒內回報。`build` 等 `quality` 通過才開始。
- e2e 的 DB 連線走 **job variables**，不在 CI 偽造 `.env`：`applyE2EDbEnv()` 以 dotenv 載入 `.env`，而 **dotenv 不覆寫既有 `process.env`**，因此 CI 供應的變數優先生效。
- `DB_TEST_DATABASE` 必須含 `test`，否則 globalSetup 守門會中止（防誤連 dev / prod）。`e2e` 與 `integration` 用**不同的測試庫**，避免兩個 job 平行執行時互相清資料。
- `git commit --no-verify` 可繞過 husky pre-commit，但繞不過 CI —— 這是把關的最後一道。
- **覆蓋率門檻只有 `test:cov` 會執行**（`test` 不帶 coverage，供開發時快速回饋）。兩個 workspace 都設有門檻：api 70/60/70/70、web 75/75/60/75；新增設有門檻的 workspace 時**必須提供 `test:cov`**，否則會被 `pnpm -r test:cov` 靜默略過。
- `apps/api` 的 `test:cov` 刻意串接架構測試（`jest --coverage && jest --config test/jest.arch.config.js`）—— 只寫 `jest --coverage` 會讓 CI 換用 `test:cov` 後靜默漏掉整組架構守則。

> **搬到其他 CI 平台時**：上表「對應本機指令」欄即為等價檢查，照樣執行即可；否則所有架構守則與測試都只在開發者本機生效。

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
pnpm docker:up               # 整套跑在容器裡（api + web + postgres + redis）
pnpm docker:init             # 容器內建表 + seed（首次一次）
pnpm docker:logs             # 跟蹤 api / web
pnpm docker:deps             # 只起 postgres + redis，api / web 跑在 host
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
pnpm --filter @app/api test:e2e          # E2E（需 PostgreSQL + Redis）

# 資料庫（一律在 apps/api 工作目錄執行）
pnpm --filter @app/api db:create
pnpm --filter @app/api db:drop
pnpm --filter @app/api db:migrate              # 開發環境（含 generate）
pnpm --filter @app/api db:migrate:deploy       # 生產環境部署
pnpm --filter @app/api db:generate             # 僅產生 Prisma client（搬 monorepo 後第一次 typecheck 必跑）
pnpm --filter @app/api db:seed
pnpm --filter @app/api db:studio

# 由 schema.prisma 的 `///` 產生 COMMENT ON（Prisma 不會自己產生），附加到新 migration
pnpm --filter @app/api gen:comments >> prisma/migrations/<新migration>/migration.sql

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
