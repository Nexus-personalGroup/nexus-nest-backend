> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 塊 1 的產出無法在本機完整驗證——workflow 只有推上 GitHub 才會執行。本機能做的是
> `actionlint`（語法）與 `pnpm verify:ci`（e2e 環境等價性），真正的驗收在首次 PR。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：塊 1（新增 workflow）與塊 2（刪除 GitLab 遺留）互相獨立，但**塊 1 必須先做**——
> 先刪後加會有一段完全沒有 CI 設定的中間狀態。塊 3 相依前兩塊的最終結果。

## 1. GitHub Actions workflow

- [x] 1.1 `.github/workflows/ci.yml`：觸發條件 `pull_request` 與 `push`，分支 `develop` / `main`
- [x] 1.2 `quality` job：`pnpm typecheck` → `pnpm lint` → `pnpm test:cov`。**必須用 `test:cov` 不是 `test`**——覆蓋率門檻只在前者執行，用後者會讓四個門檻靜默失效
- [x] 1.2b **改為 composite action**：三個 job 的前置步驟（setup-node → corepack → pnpm store 快取 → install）完全相同，抽到 `.github/actions/setup-workspace`，理由與 `compose.yml` 的 `x-app-base` anchor 相同。**順序是 setup-node 在前、corepack 在後**——`corepack enable` 建立的 shim 綁在當下的 Node 安裝目錄，先跑會被 setup-node 換掉的 Node 蓋掉；快取因此不用 `setup-node` 的 `cache: pnpm`（那需要 pnpm 已在 PATH），改用 `actions/cache` 明確指定 `pnpm store path`
- [x] 1.3 `e2e` job：service container `postgres:17`，healthcheck 用 `pg_isready -U postgres -d <db>`，**與 `compose.yml` 的指令一致**；`DB_TEST_DATABASE` 名稱必須含 `test`（globalSetup 有守門）
- [x] 1.4 `e2e` job 的步驟：`pnpm --filter @app/api db:generate` → `pnpm --filter @app/api test:e2e`。`pnpm install` 的 postinstall 只建 symlink，client 仍須自行 generate
- [x] 1.5 `build` job：`needs: [quality]`（**不含 `e2e`**——較慢的 e2e 不該阻塞產出，但它失敗仍會使整個 workflow 失敗）；僅在 push 到 develop / main 時執行
- [x] 1.6 pnpm 版本改由 `corepack` 依 `packageManager` 欄位決定，不再 `npm i -g pnpm@11.0.8` 硬釘——少一處要與本機同步的版本宣告
- [x] 1.7 `.github/PULL_REQUEST_TEMPLATE.md`：以 `.gitlab/merge_request_templates/` 的內容為基礎改寫
- [x] 1.8 驗證：**Docker 版 actionlint** 通過（exit 0、零警告）；YAML 可被解析且 `jobs` = `quality` / `e2e` / `build`、`build.needs` = `["quality"]`、e2e service = `postgres:17`。注意 npm 的 `actionlint` 套件不含執行檔（`ERR_PNPM_DLX_NO_BIN`），且它成功時無任何輸出，要以 exit code 判定

## 2. 刪除模板遺留的 CI 與腳本

- [x] 2.1 刪除 `.gitlab-ci.yml`
- [x] 2.2 刪除 `.gitlab/`（含 `merge_request_templates/`）
- [x] 2.3 刪除 `scripts/init-project.sh` —— 模板用來衍生新專案的腳本，第 3 步是 `rm -rf .git && git init`；nexus 已是衍生結果，留著只有誤執行毀掉 git 歷史的風險
- [x] 2.4 確認 `scripts/verify-ci.sh` **不受影響**：它跑的是 `docker compose --profile verify`，與 CI 平台無關
- [x] 2.5 全 repo 掃描確認無殘留的 GitLab 引用（`CI_COMMIT_BRANCH`、`CI_MERGE_REQUEST_*`、`gitlab`）
- [x] 2.6 驗證：`pnpm typecheck && pnpm lint && pnpm test` 仍全綠（本塊只刪檔案，但 `hook-scripts.spec.ts` 與 `compose-files.spec.ts` 會掃描腳本與文件的一致性）

## 3. 文件與規格同步

- [x] 3.1 `openspec/project/tooling.md`：CI job 表改寫（job 名稱、觸發條件、本機等價指令），並**刪除**「GitLab 的 services 不支援 healthcheck，CI 端沿用手動等待迴圈」那段——該分歧已不存在
- [x] 3.2 `openspec/project.md`：導覽表最後一列的「GitLab CI 各 job」改為「GitHub Actions 各 job」
- [x] 3.3 `README.md`：品質防線表的「GitLab CI」列改為 GitHub Actions，觸發條件改為 Pull Request 與 develop / main 推送
- [x] 3.4 `tasks/todo.md`：更新「首次 CI pipeline 需人工觀察」條目為 GitHub Actions 的觀察項目
- [x] 3.5 驗證：`pnpm test` 全綠（`project.md` 連結完整性與繁中掃描等守則會檢查本塊產出）

## 4. 收尾

- [x] 4.1 跑完整驗證鏈並貼出實際輸出
- [x] 4.2 `pnpm verify:ci` 確認本機 e2e 環境重現仍可用（本 change 不應動到它）
- [x] 4.3 新踩到的坑寫進 `tasks/lessons.md`
- [x] 4.4 **需使用者手動執行**：GitHub repo → Settings → Branches，對 `develop` 與 `main` 加 branch protection，勾選 `quality` 與 `e2e` 為 required status checks。**不做的話 CI 只會顯示紅燈、不會擋住合併**
- [x] 4.5 **需使用者觀察**：首次 PR 的 pipeline —— (1) `quality` / `e2e` 是否確實於 PR 觸發；(2) pnpm cache 是否命中；(3) 總時長是否可接受（過慢則把 `e2e` 限縮為只在 PR 跑）
- [x] 4.6 `openspec archive refactor-migrate-ci-to-github-actions` 封存
