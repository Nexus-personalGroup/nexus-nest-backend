## Context

`.gitlab-ci.yml` 是模板留下的完整 pipeline（5 stages / 6 jobs / 13 KB），其中包含大量針對 GitLab Runner 特性的補償措施。nexus 的遠端在 GitHub，這份設定不會被任何東西執行——`platform-ci-quality-gate` 的六條需求目前全部沒有執行路徑。

移植的重點**不是逐行翻譯**。GitLab CI 的若干設計是為了繞過該平台的限制，換到 GitHub Actions 後那些限制不存在，硬翻等於把別人的疤痕帶過來。

## Goals / Non-Goals

**Goals:**

- `platform-ci-quality-gate` 的每一條需求都有實際執行路徑：typecheck / lint / test:cov（含覆蓋率門檻與架構守則）/ e2e 對真實 PostgreSQL
- PR 階段即觸發，不是合併後才跑
- 品質未過不進建置
- CI 與本機的資料庫就緒判定使用**同一套機制**

**Non-Goals:**

- **不移植部署相關設定**：原檔案下方 80 行註解掉的部署範本綁定 GitLab registry、內部 Docker 專案與 SSH 部署主機，nexus 沒有這些。要部署時另開 change，從 nexus 的實際部署目標反推
- 不引入 PR 自動審查（原 `pr_agent_job` 是 GitLab + CodiumAI 的組合，且原本就 `when: never`）
- 不改任何程式碼、測試或資料庫設定
- 不設定 branch protection——那是 GitHub repo 的設定，不在版控內，只能由使用者手動處理

## Decisions

### D1：不逐行翻譯，砍掉三個在 GitHub Actions 下沒有意義的 job

| GitLab job | 處置 | 理由 |
| --- | --- | --- |
| `npm-install`（獨立 prepare stage） | **刪除** | GitLab 需要它把 `node_modules` 灌進 cache 給後續 stage 撈。GitHub Actions 的 `setup-node` 內建 pnpm store 快取，各 job 自己 `pnpm install --frozen-lockfile` 即可，反而少一次 job 排程與 cache 上傳的往返 |
| `cleanup`（rm -rf node_modules / dist） | **刪除** | GitLab Runner 可能重用工作目錄，需要自己收拾。GitHub 的 runner 是拋棄式的，這個 job 純粹是浪費 |
| `pr_agent_job` | **刪除** | 綁 GitLab API 與 CodiumAI，且 rules 是 `when: never`——從未執行過。要 PR 審查另議 |

### D2：移除等待迴圈，CI 與本機共用 healthcheck

原檔案有 15 行 Node 輪詢（`.wait_for_mysql_script`），註解明白寫著原因：

> 為何不用 healthcheck：GitLab CI 的 services 不支援 docker compose 的 `healthcheck` / `depends_on: condition: service_healthy` 語法，只能手動等。

**GitHub Actions 的 service container 支援 `--health-cmd` / `--health-interval` / `--health-retries`**，而且 job 會等到 healthy 才開始跑 step。所以這整段連同它記錄的分歧一起消失：

```yaml
services:
  postgres:
    image: postgres:17
    options: >-
      --health-cmd "pg_isready -U postgres -d nexus_ci_test"
      --health-interval 2s --health-timeout 3s --health-retries 30
```

判定指令與 `compose.yml` 的 `postgres` / `postgres-verify` **完全一致**（`pg_isready -U … -d …`）。這不只是少寫 15 行——原本「本機用 healthcheck、CI 用輪詢」是兩套會各自出錯的機制，現在只剩一套。

> 上一支 change 在 `platform-container-dev` 加的需求說明了為什麼一定要 `pg_isready`：PostgreSQL 官方映像初始化時會先起一次臨時伺服器，只探行程或埠會誤判為就緒。CI 若還用「連得上 port 就算好」的輪詢，正好會踩中這個陷阱。

### D3：不搬 `.copy_env_script`

原本每個需要 `db:generate` 的 job 都會先跑它，邏輯是「master 用 `.env.production`、其餘用 `.env.develop`」。但**這兩個檔案在 repo 裡從未存在**，所以它每次都走到 else 分支 `touch apps/api/.env` 產生一個空檔。

GitHub Actions 直接在 job 的 `env:` 供應變數即可。`db:generate` 只需要組出 `DATABASE_URL` 字串、不會連線，所以給假值也行——但既然 e2e job 本來就要真的連線參數，統一用真值更少一種狀態。

### D4：`master` → `main`，MR → PR

repo 已有 `main` 分支，GitLab 的 `master` 純粹是模板慣例。`platform-ci-quality-gate` 的 spec 裡「Merge Request」也一併改成「Pull Request」——需求的**實質內容不變**，這正好驗證了原 spec 寫得夠平台無關。

### D5：job 相依用 `needs`，維持「品質未過不建置」

```
quality ──┐
          ├─→ build   （needs: [quality]）
e2e ──────┘   ← 不列入 build 的 needs
```

沿用原設計的取捨：`e2e` 較慢，不讓它阻塞 `build` 的產出，但它失敗仍會使整個 workflow 失敗。`quality` 失敗則 `build` 不執行。

### D6：刪除 `scripts/init-project.sh`

它是模板用來「從基座衍生新專案」的腳本，動作包含 `rm -rf .git && git init`。nexus 已經是衍生出來的結果，這支腳本在此的唯一效果是**誤執行時毀掉整個 git 歷史**。

歸在本 change 而非另開一支，是因為同屬「清掉模板遺留、在 nexus 沒有執行路徑的工程設定」——與刪 `.gitlab-ci.yml` 是同一件事的兩個面向。

## Risks / Trade-offs

- **[CI 綠燈不等於擋得住合併]** GitHub 的 status check 預設只顯示結果，不阻擋 merge → 必須在 repo 設定 branch protection 把 `quality` / `e2e` 設為 required。**這不在版控內，AI 也改不到**，列為使用者手動步驟。沒做的話 `platform-ci-quality-gate` 的「品質未通過不得進入建置階段」在人為 merge 面前形同虛設

- **[首跑才知道實際耗時與 cache 命中]** 本機 `pnpm verify:ci` 只能重現「測試環境」，重現不了 runner 行為 → 首次 PR 要人工觀察三件事：`quality` / `e2e` 是否確實在 PR 觸發、pnpm cache 是否命中、總時長是否可接受。過慢的話把 `e2e` 限縮成只在 PR 跑

- **[刪掉部署範本後就沒有參考了]** 原檔案下方 80 行註解掉的部署流程（build image → push registry → SSH 部署 → migrate → health check）雖然綁 GitLab，但流程順序有參考價值 → 該範本仍完整保留在模板 repo `hexagonal-nest-express-mysql` 的 git 歷史中，需要時回去看；nexus 這邊留著只會是永遠不會被執行的 80 行註解

- **[pnpm 版本漂移]** 原設定用 `npm i -g pnpm@11.0.8` 硬釘 → 改用 `packageManager` 欄位（`pnpm@11.0.8`）搭配 `corepack`，讓 CI 與本機從同一個來源取版本，少一處要同步的地方

## Migration Plan

無資料遷移。切換當下 GitLab CI 直接失效（本來就沒有在跑），GitHub Actions 於下一次 push / PR 生效。

**需使用者手動執行**：GitHub repo → Settings → Branches → 對 `develop` 與 `main` 加 branch protection rule，勾選 `quality` 與 `e2e` 為 required status checks。
