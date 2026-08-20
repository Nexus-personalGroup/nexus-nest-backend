## Why

nexus 的核心資料是稽核軌跡與時序事件（M3 監控埋點）：半結構化的 `metadata`、按時間範圍掃描的行為紀錄、可篩選的異常清單。MySQL 的 JSON 型別建不出等價於 PostgreSQL JSONB + GIN 的索引，時序資料也沒有 BRIN 這種近乎零成本的索引選項。

**成本視窗只有現在**：專案尚無部署、無資料、無其他開發者的本機庫，換底座等同改幾個設定檔；等 M3 埋點做完再換，就變成一場資料遷移工程。另外 eden 本來就跑在 PostgreSQL，熟悉度不需要重新累積。

## What Changes

- **BREAKING** datasource provider `mysql` → `postgresql`。既有 3 支 migration 刪除並重新產生為單一 init migration（Prisma 的 migration 是 provider-specific 的原始 SQL，無法沿用）
- Prisma driver adapter `PrismaMariaDb` → `PrismaPg`；依賴 `mysql2` + `@prisma/adapter-mariadb` 換成 `pg` + `@prisma/adapter-pg`
- 所有 `DateTime` 欄位改標 `@db.Timestamptz(3)`，取代 MySQL 版靠 driver `timezone: 'Z'` 強制 UTC 的做法（理由見 design.md D2）
- **schema 補上欄位描述**：11 個 model 與 69 個欄位加 `///` 文件註解（描述欄位的功能與陷阱，非欄位名翻譯），並在 init migration 末尾以 `COMMENT ON` 把同一份描述寫進資料庫；新增產生器 `gen:comments` 由 `///` 產出 SQL，避免兩邊各寫一次而漂移（理由見 design.md D7）
- `compose.yml` 的 `mysql` / `mysql-verify` 服務換成 `postgres` / `postgres-verify`；對外埠 3316 / 13306 → 5442 / 15432
- `create-database.ts` / `drop-database.ts` 改用 `pg`，並處理 PostgreSQL 特有的兩件事：沒有 `CREATE DATABASE IF NOT EXISTS`、`DROP DATABASE` 遇既有連線會失敗
- `prisma-env.ts` / `prisma.config.ts` 的 URL scheme `mysql://` → `postgresql://`
- 文件同步：`README.md`、`openspec/project.md`、`openspec/project/tooling.md`、`openspec/project/testing.md`

## Capabilities

### Modified Capabilities

- `platform-container-dev`：三條需求的具體值隨資料庫更換而變——compose 的服務名稱（`mysql` → `postgres`）、對外埠避讓的基準（3306 → 5432）、本機與 CI 共用的版本線（`mysql:9` → `postgres:17`）
- `platform-engineering-guardrails`：「架構檢查不依賴外部服務」該需求的情境敘述點名 MySQL，同步更名

## Impact

- **依賴**：`apps/api/package.json` 增刪四個套件，需重跑 `pnpm install`
- **需使用者手動處理**：`apps/api/.env` 的 `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE`——CLAUDE.md 規定 AI 不得修改 `.env`，只能改 `.env.example`
- **需重跑 migration**：`pnpm --filter @app/api db:migrate` 產生並套用 init migration，接著 `db:seed`
- **需清除舊容器**：`docker compose down -v` 移除 `mysql-data` volume
- **e2e 改跑真實 PostgreSQL**：模板的 log purge 使用手寫 raw SQL，方言相容性需逐一驗證
