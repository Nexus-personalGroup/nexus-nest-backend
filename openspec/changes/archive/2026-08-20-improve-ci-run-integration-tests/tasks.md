> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 塊 1 額外需 `pnpm --filter @app/api test:integration`（確認改動後本機仍通過）。
> workflow 本身**無法在本機完整驗證**——只有推上 GitHub 才會執行。本機能做的是
> `actionlint`（語法）與「本機整合測試仍綠」，真正的驗收在首次 PR。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：塊 1 必須先做——CI 的 job 建立在「測試的連線設定是明示的」這個前提上，
> 順序反過來會先寫出一個依賴巧合的 workflow。塊 3 相依前兩塊的最終結果。

## 1. 讓整合測試的外部相依由設定明示

- [x] 1.1 `test/setup/setup-env.integration.ts` 明確設定 `REDIS_HOST` / `REDIS_PORT`，取自環境變數並提供預設值。**現況是沒設**——本機靠 `.env` 的 6389、CI 靠 `envSchema` 預設的 6379 碰巧對上，兩者沒有任何關聯
- [x] 1.2 在該檔以註解說明這支測試的外部相依：真 PostgreSQL（測試庫）+ **真 Redis**（跨實例廣播的載體，不可 mock）
- [x] 1.3 驗證：本機 `pnpm --filter @app/api test:integration` 仍 11 條全綠（改動不應改變本機行為）

## 2. CI 新增 integration job

- [x] 2.1 `.github/workflows/ci.yml` 新增 `integration` job：`services` 含 `postgres:17` **與 `redis:7`**——CI 至今沒有 Redis，因為 e2e 把它 mock 掉了
- [x] 2.2 Redis service 宣告 healthcheck（`redis-cli ping`），與 postgres 同樣讓 job 等到 healthy 才開始。Redis 沒有 PostgreSQL 那種「初始化時先起臨時伺服器」的陷阱，但仍不可用固定秒數等待
- [x] 2.3 job env：`DB_TEST_DATABASE` 須含 `test`（`applyE2EDbEnv` 會守門並在不符時中止）、Redis 連線指向 service container
- [x] 2.4 步驟沿用既有模式：`actions/checkout` → `./.github/actions/setup-workspace` → `db:generate` → `test:integration`
- [x] 2.5 **不列入 `build` 的 `needs`**：沿用 `e2e` 的取捨——較慢的驗證不阻塞產出，但失敗仍會使整個 workflow 失敗
- [x] 2.6 驗證：Docker 版 actionlint 通過（exit 0）；YAML 解析後確認 `jobs` 含 `integration`、其 `services` 含 postgres 與 redis、`build.needs` 仍只有 `quality`

## 3. 文件與規格同步

- [x] 3.1 `openspec/project/tooling.md`：CI job 表加入 `integration` 列，並說明它與 `e2e` 的前置條件相反（一個 mock Redis、一個要真 Redis）
- [x] 3.2 `openspec/project/testing.md`：整合測試段落補上「CI 會執行」，取代目前「只在本機驗證過」的敘述
- [x] 3.3 `tasks/todo.md`：移除「整合測試在 CI 尚未跑過」的觀察項
- [x] 3.4 驗證：`pnpm test` 全綠（`project-docs.spec.ts` 會檢查文件連結完整性）

## 4. 收尾

- [x] 4.1 跑完整驗證鏈並貼出實際輸出
- [x] 4.2 新踩到的坑寫進 `tasks/lessons.md`
- [x] 4.3 **需使用者觀察**：首次 PR 的 run —— (1) 兩個實例佔埠（34101 / 34102）在 runner 上不衝突；(2) Redis service 連得上；(3) 整體時長可接受。**若出現間歇性失敗，保留完整 log 不要用 grep 過濾**
- [x] 4.4 `openspec archive improve-ci-run-integration-tests` 封存
