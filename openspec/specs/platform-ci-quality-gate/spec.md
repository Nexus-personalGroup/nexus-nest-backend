# platform-ci-quality-gate Specification

## Purpose

定義 CI 對品質檢查的執行保證：哪些檢查必須在 CI 執行、在什麼時機觸發、失敗是否阻擋後續 stage，
以及 e2e 在 CI 的資料庫隔離要求。

存在理由：專案的架構守則、單元測試與 e2e 若只在開發者本機執行，其效力取決於「是否記得跑」，
且 `git commit --no-verify` 即可繞過 git hook。CI 是把關的最後一道。

## Requirements

### Requirement: CI 必須執行完整品質檢查

CI pipeline SHALL 執行型別檢查、lint 與測試（含架構規則）。任一項失敗 MUST 使 pipeline 失敗，且 MUST NOT 僅依賴開發者本機執行或 git hook。

#### Scenario: 提交含型別錯誤的程式碼

- **WHEN** 推送的程式碼無法通過 `pnpm typecheck`
- **THEN** CI 的品質 job 失敗，pipeline 中止

#### Scenario: 提交違反架構規則的程式碼

- **WHEN** 推送的程式碼違反任一架構守則（如 controller 直接相依持久層）
- **THEN** CI 的品質 job 失敗，訊息包含違規的檔案與行號

#### Scenario: 繞過 git hook 提交

- **WHEN** 開發者以 `--no-verify` 略過 pre-commit hook 並推送
- **THEN** CI 仍執行完整檢查並攔截問題

### Requirement: 品質檢查必須在 Merge Request 階段執行

品質檢查 SHALL 於 Merge Request 觸發，不得只在合併後的分支推送才執行。

#### Scenario: 開啟 Merge Request

- **WHEN** 對 develop 或 master 開啟 Merge Request
- **THEN** 品質檢查隨即執行，結果呈現於該 MR

### Requirement: e2e 必須在 CI 對真實資料庫執行

CI SHALL 提供資料庫服務供 e2e 使用，MUST NOT 以 mock 取代。測試資料庫名稱 MUST 通過既有的 `*test*` 守門檢查。

#### Scenario: CI 執行 e2e

- **WHEN** 品質 job 通過後執行 e2e job
- **THEN** 以 service container 提供的資料庫建立測試庫、套用 migration 並執行全部 e2e

#### Scenario: 資料庫名稱不含 test

- **WHEN** CI 設定的測試資料庫名稱不含 `test`
- **THEN** e2e 於 globalSetup 階段中止，不執行任何 migration

### Requirement: 品質未通過不得進入建置階段

建置 job SHALL 相依於品質檢查 job，品質檢查失敗時 MUST NOT 執行建置。

#### Scenario: 品質檢查失敗

- **WHEN** 品質 job 失敗
- **THEN** 建置 job 不被執行

### Requirement: 覆蓋率門檻必須有執行路徑

每個設有覆蓋率門檻的 workspace MUST 提供執行該門檻的指令，且 CI 的品質檢查 MUST 執行它。設定了門檻卻無任何自動流程會執行，MUST 視為缺陷。

#### Scenario: 覆蓋率低於門檻

- **WHEN** 某 workspace 的覆蓋率低於其設定門檻
- **THEN** CI 的品質 job 失敗，pipeline 中止

#### Scenario: 新增設有門檻的 workspace

- **WHEN** 新增一個設有覆蓋率門檻的 workspace
- **THEN** 該 workspace 必須提供 `test:cov`，才能被 root 的遞迴指令與 CI 涵蓋

### Requirement: 覆蓋率指令必須涵蓋架構規則

執行覆蓋率的指令 MUST 一併執行架構守則測試，避免以覆蓋率取代測試時漏掉架構檢查。

#### Scenario: CI 執行品質檢查

- **WHEN** CI 執行覆蓋率指令
- **THEN** 單元測試、覆蓋率門檻與架構守則三者皆被驗證
