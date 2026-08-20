## MODIFIED Requirements

### Requirement: 架構檢查執行成本

架構檢查 MUST NOT 相依資料庫、Redis 或 HTTP 伺服器，且 MUST 可在單元測試指令中執行，不得併入需要真實資料庫的 e2e 流程。

#### Scenario: 在無資料庫環境執行

- **WHEN** 在未啟動 PostgreSQL / Redis 的環境執行架構檢查
- **THEN** 檢查正常完成並回報結果
