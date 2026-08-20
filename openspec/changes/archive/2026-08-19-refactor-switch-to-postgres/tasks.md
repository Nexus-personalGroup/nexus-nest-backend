> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 塊 2 額外需 `pnpm --filter @app/api db:migrate` 與 `pnpm build`（動到 module 建構子與 Prisma client 型別）。
> 塊 3 額外需 `pnpm --filter @app/api test:e2e`（對真實 PostgreSQL）。
> 綠燈後給 commit 指令，由使用者手動執行——**本 change 採一個 change 一個 commit**，塊間不分開提交。
>
> **塊的依賴**：塊 1 必須最先做——塊 2 的 `db:migrate` 需要一個跑得起來的 PostgreSQL 容器。
> 塊 2 是本 change 的原子核心，內部任何一項單獨抽出都會留下 typecheck 不過的中間狀態，不可再拆。
> 塊 2b 追加於實作途中（見其標題下的說明）。塊 3 相依塊 2。
> 塊 4 與程式碼無相依，但內容取決於前面的最終結果，故排最後。

## 1. 容器與環境設定

- [x] 1.1 `compose.yml`：`mysql` 服務改為 `postgres`（`image: postgres:17`），環境變數改 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`，volume 改 `postgres-data:/var/lib/postgresql/data`
- [x] 1.2 `compose.yml`：healthcheck 改用 `pg_isready -U <user> -d <db>`，**不可**只檢查行程或埠——PostgreSQL 官方映像初始化期間會先起一次臨時伺服器，僅檢查行程會得到「已就緒」的錯誤結論
- [x] 1.3 `compose.yml`：`mysql-verify` → `postgres-verify`，`tmpfs` 路徑改 `/var/lib/postgresql/data` 並設 `PGDATA` 指向子目錄（tmpfs 掛在 PGDATA 父層會讓 initdb 因目錄非空而拒絕啟動），對外埠 13306 → 15432
- [x] 1.4 `compose.yml`：dev 對外埠 3316 → 5442；api 服務的 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / 資料庫名稱同步；檔頭註解的三種用法與埠說明同步
- [x] 1.5 **追加**：根目錄 `package.json` 的 `docker:deps` script 仍指向 `mysql` 服務，一併修正（原盤點遺漏）
- [x] 1.6 `scripts/verify-ci.sh`：服務名稱、埠、使用者、資料庫名稱改用 `postgres-verify`
- [x] 1.7 **追加**：`README.md` 的埠號表與 Docker 段落——`compose-files.spec.ts` 守則要求 compose 的對外埠必須寫進 README，屬鏈式依賴，必須綁進本塊
- [x] 1.8 ~~`apps/api/.env.example`~~ —— **改由使用者執行**：該檔在 AI 的權限設定中被拒絕存取，內容需求已轉列 5.4
- [x] 1.9 驗證：`docker compose config` 無錯、`pnpm docker:deps` 兩個容器 healthy、`psql` 連得上 5442、`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 連線層、Schema 與 Migration（原子塊，不可再拆）

- [x] 2.1 `apps/api/package.json`：移除 `mysql2`、`@prisma/adapter-mariadb`；加入 `pg`、`@types/pg`、`@prisma/adapter-pg`。三個 Prisma 套件一起提到 `^7.9.0`，實際解析結果 `prisma` / `@prisma/client` / `@prisma/adapter-pg` 皆為 **7.9.1**，版號對齊
- [x] 2.2 `pnpm install` 並確認 lockfile 更新
- [x] 2.3 `src/infrastructure/prisma/prisma.service.ts`：`PrismaMariaDb` → `PrismaPg`，維持逐欄 object config（已確認 `PrismaPg` 建構子接受 `pg.PoolConfig`）；刪除 `timezone: 'Z'` 與 `allowPublicKeyRetrieval`
- [x] 2.4 `prisma.config.ts` 與 `scripts/prisma-env.ts`：URL scheme `mysql://` → `postgresql://`
- [x] 2.5 `prisma/schema.prisma`：`provider = "postgresql"`；23 個 `DateTime` 欄位加 `@db.Timestamptz(3)`；`@db.Text` 移除；`@db.VarChar(n)` 保留
- [x] 2.6 刪除舊 migration 與 `migration_lock.toml`，產生單一 init migration；新 `migration_lock.toml` 的 provider 為 `postgresql`
- [x] 2.7 `scripts/create-database.ts`：改用 `pg`，連 `postgres` 維護庫查 `pg_database`（PostgreSQL 沒有 `CREATE DATABASE IF NOT EXISTS`），識別字走 `client.escapeIdentifier`
- [x] 2.8 `scripts/drop-database.ts`：改用 `pg`，`DROP DATABASE IF EXISTS ... WITH (FORCE)`
- [x] 2.9 `test/setup/global-setup.ts`：改用 `pg` 建測試庫；`_test` 結尾守門仍生效
- [x] 2.10 **追加**：`scripts/seed-runner.ts` 也用了 `PrismaMariaDb`，原盤點遺漏，由 typecheck 抓出
- [x] 2.11 確認無測試依賴「超長字串被資料庫拒絕」——281 支單元與 151 支 e2e 全過，無此類斷言
- [x] 2.12 驗證：`db:migrate` → `db:seed` → `typecheck` / `lint` / `test` / `build` 全綠

## 2b. 欄位描述（實作途中追加）

> 追加原因：init migration 是唯一一次能免費重建整個 schema 的機會，等 M1 加聊天資料表之後
> 補描述就得一張表一張表另開 migration。決策與取捨見 design.md D7。

- [x] 2b.1 `schema.prisma`：11 個 model + 69 個欄位加 `///` 描述，內容為欄位的功能與陷阱而非欄位名翻譯；`id` 與一般 `created_at` / `updated_at` 刻意不寫
- [x] 2b.2 描述內容逐條對照原始碼查證（`token_version` 對 `JwtAuthGuard`、`password_reset_tokens.token` 對 `PrismaPasswordResetTokenRepository` 的 sha256、`uploaded_by` 對 `DeleteAttachmentService` 的擁有者檢查、`file_type` 對 `sniffMime`、`is_auto_block` 對 `PrismaIpListRepository`），不憑印象撰寫
- [x] 2b.3 新增 `scripts/gen-column-comments.ts` 與 `gen:comments` script：解析 `schema.prisma` 的 `///` 產生 `COMMENT ON TABLE` / `COMMENT ON COLUMN`
- [x] 2b.4 init migration 末尾附加 80 條 `COMMENT ON`，並註明來源與維護方式
- [x] 2b.5 驗證兩層都生效：產出的 `.prisma/client/index.d.ts` 含 JSDoc；`pg_description` 查得到欄位描述

## 3. raw SQL 方言相容

- [x] 3.1 盤點 `$queryRaw` / `$executeRaw`：`PrismaLogPurgeRepository`（分批刪除）與 `DbHealthIndicator`（`SELECT 1`，方言無關）
- [x] 3.2 改寫日誌清理的分批刪除——**PostgreSQL 的 `DELETE` 不支援 `LIMIT`**，改為 `DELETE ... WHERE ctid IN (SELECT ctid ... ORDER BY created_at LIMIT n)`；每批 5000、批間讓出 100ms 的行為不變
- [x] 3.3 e2e 無需改動：斷言驗的是刪除結果而非 SQL 字串，跨批（6000 筆）情境維持
- [x] 3.4 **反向驗證**：把 `created_at <` 改成 `>`，3 支 log-purge e2e 全數變紅；改回後全綠，`git diff` 只剩預期改動
- [x] 3.5 驗證：`pnpm --filter @app/api test:e2e` 對真實 PostgreSQL **151 passed / 10 suites**

## 4. 文件與規格同步

- [x] 4.1 `openspec/project.md`：ORM 列改 `@prisma/adapter-pg`、Database 列改 PostgreSQL 17 並註明 UTC 由欄位層保證
- [x] 4.2 `openspec/project/tooling.md`：CI job 表、`verify:ci` 說明、compose 三種用法表、`postgres-data` volume、完整指令參考
- [x] 4.3 `openspec/project/testing.md`：專用測試庫段落的 `PrismaMariaDb` → `PrismaPg`
- [x] 4.4 `README.md`：環境需求、Docker 三種用法、埠號表、e2e 說明、常見問題
- [x] 4.5 **追加**：`openspec/project/backend-utilities.md` 新增「欄位描述（schema 與資料庫兩層）」一節，記錄 `///` 不會產生 `COMMENT ON` 這個易誤解點與 `gen:comments` 的使用方式
- [x] 4.6 ~~`.gitlab-ci.yml` 的 MySQL service container~~ —— **刻意不改**：下一支 change `refactor-migrate-ci-to-github-actions` 會整檔汰換，改了是丟棄工作。代價是這段期間 CI 設定與其餘部分不一致，但本 repo 無 GitLab remote，實際影響為零
- [x] 4.7 驗證：`pnpm test` 全綠（`project.md` 連結完整性、compose 埠號、繁中掃描等守則會檢查本塊產出）

## 5. 收尾

- [x] 5.1 跑完整驗證鏈並貼出實際輸出
- [x] 5.2 `pnpm audit` 重新盤點：**77 個，與模板時期完全相同**——移除 `mysql2` 沒有減少任何一項，代表這些漏洞全不在資料庫 driver 這條路徑上。已更新 `tasks/todo.md` 的條目
- [x] 5.3 更新 `tasks/todo.md`（M0 進度、漏洞盤點）；`tasks/lessons.md` 新增 5 條：`DELETE` 不支援 `LIMIT`、`pg_isready` 與初始化期臨時伺服器、tmpfs 需設 `PGDATA` 子目錄、`///` 不會產生 `COMMENT ON`、Prisma 7 CLI 旗標與非 TTY 卡住
- [x] 5.4 **需使用者手動執行**：修改 `apps/api/.env` 與 `apps/api/.env.example` 的 `DB_PORT=5442` / `DB_USERNAME=postgres` / `DB_DATABASE=nexus_db` / `DB_TEST_DATABASE=nexus_test`（AI 對這兩個檔案無寫入權限）
- [x] 5.5 `openspec archive refactor-switch-to-postgres` 封存，delta spec 併入 `openspec/specs/`
