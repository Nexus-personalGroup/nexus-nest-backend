## Why

repo 的遠端是 `github.com/Nexus-personalGroup/nexus-nest-backend`，但版控裡躺著的是 13 KB 的 `.gitlab-ci.yml` 與 `.gitlab/merge_request_templates/`。**目前推上去的程式碼完全沒有任何 CI 在把關**——`platform-ci-quality-gate` 那六條需求一條都沒有執行路徑，正好是該 spec 自己定義的缺陷型態（「設定寫了但沒有執行路徑」）。

同時 `.gitlab-ci.yml` 的 e2e job 仍指向 `mysql:9`，在 PostgreSQL 轉換時刻意不改（見上一支 change 的 tasks 4.6），現在一併汰換。

## What Changes

- **BREAKING** 刪除 `.gitlab-ci.yml` 與 `.gitlab/merge_request_templates/`，改以 `.github/workflows/ci.yml` 承載品質關卡
- e2e 的 service container `mysql:9` → `postgres:17`，與本機 compose、`verify:ci` 共用同一條版本線
- **移除 CI 專屬的等待迴圈**：GitHub Actions 的 service container 支援 `--health-cmd`，`.wait_for_mysql_script` 那段 15 行的 Node 輪詢可整段刪除，CI 與本機改用同一套就緒判定機制（`pg_isready`）
- 觸發條件 `master` → `main`（本 repo 的預設分支）；MR 用語改為 PR
- 刪除三個在 GitHub Actions 下無意義的 job：`npm-install`（改由各 job 以 `setup-node` + pnpm cache 處理）、`cleanup`（runner 是拋棄式的）、`pr_agent_job`（GitLab 專屬，且原本就是 `when: never`）
- 刪除 `.copy_env_script`：它引用的 `.env.develop` / `.env.production` 兩個檔案在本 repo 從未存在，實際行為只是 `touch` 一個空 `.env`；GitHub Actions 直接用 job `env` 供應變數
- 新增 `.github/PULL_REQUEST_TEMPLATE.md`，取代 `.gitlab/merge_request_templates/`
- **刪除 `scripts/init-project.sh`**：模板用來衍生新專案的腳本，其第 3 步是 `rm -rf .git && git init`。nexus 本身就是衍生出來的專案，這支腳本在此只有「誤執行會毀掉整個 git 歷史」的風險，沒有任何用途

## Capabilities

### Modified Capabilities

- `platform-ci-quality-gate`：需求本身（要跑什麼檢查、失敗是否阻擋）不變——這代表原 spec 寫得夠平台無關。變的是 (1) 觸發時機的用語 Merge Request → Pull Request、分支 master → main；(2) 新增一條需求：CI 的資料庫 service 必須以 healthcheck 判定就緒，不得用固定秒數或自訂輪詢

## Impact

- **新增**：`.github/workflows/ci.yml`、`.github/PULL_REQUEST_TEMPLATE.md`
- **刪除**：`.gitlab-ci.yml`、`.gitlab/`、`scripts/init-project.sh`
- **文件**：`openspec/project/tooling.md` 的 CI job 表與 `verify:ci` 定位說明、`README.md` 的品質防線表、`openspec/project.md` 的導覽表（「GitLab CI 各 job」）
- **需使用者手動處理**：在 GitHub repo 設定 branch protection，把 `quality` 與 `e2e` 設為 required status checks——**否則 CI 只會顯示紅燈，不會真的擋住合併**
- 無程式碼與資料庫改動；`pnpm verify:ci` 的本機行為不變
