## RENAMED Requirements

- FROM: `### Requirement: 品質檢查必須在 Merge Request 階段執行`
- TO: `### Requirement: 品質檢查必須在 Pull Request 階段執行`

## MODIFIED Requirements

### Requirement: 品質檢查必須在 Pull Request 階段執行

品質檢查 SHALL 於 Pull Request 觸發，不得只在合併後的分支推送才執行。

#### Scenario: 開啟 Pull Request

- **WHEN** 對 develop 或 main 開啟 Pull Request
- **THEN** 品質檢查隨即執行，結果呈現於該 PR

#### Scenario: 檢查結果未設為必要條件

- **WHEN** repo 未將品質 job 設為 required status check
- **THEN** 檢查仍會執行並顯示結果，但**不會阻擋合併**——本需求的保證在此情況下不成立，設定 branch protection 是使其生效的必要條件

## ADDED Requirements

### Requirement: CI 的資料庫服務必須以 healthcheck 判定就緒

CI 提供給 e2e 的資料庫 service container SHALL 宣告 healthcheck，且 job 的執行步驟 MUST 在服務通過健康檢查後才開始。
MUST NOT 使用固定秒數等待或自訂的連線輪詢作為就緒判定。

判定指令 MUST 與本機 `compose.yml` 所使用者一致。兩邊各用一套機制時，只有其中一邊會在
PostgreSQL 初始化行為變動時暴露問題，另一邊會以難以診斷的方式間歇失敗。

**「連得上 port 就算就緒」是不成立的**：PostgreSQL 官方映像在首次初始化期間會先啟動一次
臨時伺服器執行 initdb 與初始化腳本，該階段行程存在但尚未接受正式連線。

#### Scenario: 資料庫仍在初始化

- **WHEN** service container 尚未通過 healthcheck
- **THEN** job 的 step MUST NOT 開始執行

#### Scenario: 以固定秒數或連線輪詢取代 healthcheck

- **WHEN** 有人以 sleep 或自訂的 TCP 輪詢作為就緒判定
- **THEN** 違反本需求——前者在不同 runner 上不成立，後者會把「臨時伺服器已開埠」誤判為就緒

#### Scenario: 本機與 CI 的判定指令分歧

- **WHEN** CI 的 healthcheck 指令與 `compose.yml` 的不一致
- **THEN** 違反本需求
