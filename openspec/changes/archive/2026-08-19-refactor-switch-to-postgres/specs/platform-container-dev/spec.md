## MODIFIED Requirements

### Requirement: 單一 compose 檔涵蓋三種用途

系統 SHALL 以**單一** `compose.yml` 支援三種用法，靠「指定服務」與 profile 區分：
整套跑在容器（預設 `up`）、只起相依服務（`up postgres redis`）、
重現 CI 的 e2e 環境（`--profile verify`）。

verify 用的 PostgreSQL MUST 獨立成服務而非共用開發用的那個——兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它 MUST 掛在 profile 底下，
使平常的 `up` 不會啟動它。

三者與 CI 的 service container MUST 共用同一條 PostgreSQL 版本線，避免「本機過、CI 掛」。

#### Scenario: 預設啟動整套

- **WHEN** 執行 `docker compose up -d`
- **THEN** api、web、postgres、redis 四個服務啟動，`postgres-verify` MUST NOT 啟動

#### Scenario: 只起相依服務

- **WHEN** 執行 `docker compose up -d postgres redis`
- **THEN** 僅資料庫與快取啟動，api / web 由開發者在 host 執行

#### Scenario: 重現 CI 環境

- **WHEN** 執行 `--profile verify`
- **THEN** 啟動 tmpfs 版 PostgreSQL，測試結束後連同資料卷移除

### Requirement: 對外埠避開預設值且僅綁本機

系統 SHALL 讓所有對外埠避開 PostgreSQL 5432 與 Redis 6379 的預設值，並綁在 `127.0.0.1`。
埠與密碼 MUST 可由 repo 根目錄 `.env` 覆寫。

多數開發機已有一組資料庫在跑，佔用預設埠會讓容器直接起不來；綁 loopback 則避免
開發用服務曝露到區網。

#### Scenario: 機器上已有 PostgreSQL 佔用 5432

- **WHEN** 啟動整套
- **THEN** 容器使用非預設埠，兩者並存互不衝突

#### Scenario: 埠號需要調整

- **WHEN** 在根目錄 `.env` 設定對應變數
- **THEN** compose 採用該值，文件記載的預設值不再適用

## ADDED Requirements

### Requirement: 資料庫容器的就緒判定不得依賴猜測等待

compose 的資料庫服務 MUST 宣告 healthcheck，且相依它的服務 MUST 以
`condition: service_healthy` 等待，MUST NOT 改用固定秒數的 sleep。

PostgreSQL 官方映像在初始化期間會**先啟動一次臨時伺服器**執行初始化腳本，
該階段對外埠尚未開放但行程已存在——僅檢查行程或埠會得到「已就緒」的錯誤結論，
症狀是 api 容器在資料庫初始化中途嘗試連線並以認證失敗告終。
判定 MUST 使用 `pg_isready` 並指定資料庫與使用者。

#### Scenario: 首次啟動時資料庫仍在初始化

- **WHEN** volume 為空，PostgreSQL 執行首次初始化
- **THEN** healthcheck 在初始化完成前 MUST NOT 回報 healthy，api 容器持續等待

#### Scenario: 以固定秒數等待取代 healthcheck

- **WHEN** 有人把 `condition: service_healthy` 換成 sleep
- **THEN** 違反本需求——等待秒數在不同機器上不成立，且失敗時無法區分「太慢」與「真的壞了」
