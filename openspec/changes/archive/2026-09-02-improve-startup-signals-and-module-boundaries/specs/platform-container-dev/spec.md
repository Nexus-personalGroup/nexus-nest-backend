## ADDED Requirements

### Requirement: 應用容器的就緒判定

compose 的 api 服務 MUST 宣告 healthcheck，判定 MUST 打應用自己的健康端點
（`/api/health`），MUST NOT 只檢查行程存在或埠開啟。
相依它的服務（nginx）MUST 以 `condition: service_healthy` 等待。

容器啟動與「可以接請求」之間有一段實質空窗：`nest build` 產出 `dist/main.js`、
Prisma 連上資料庫、Nest 完成 bootstrap。**`docker compose up -d --wait`
對沒有 healthcheck 的服務只等到 running**，於是它會在那段空窗中回報成功。

healthcheck MUST 宣告 `start_period` 涵蓋容器內的首次編譯時間。
沒有寬限期時 retries 會在編譯完成前用盡，而失敗訊息是「unhealthy」——
比原本的「起來了卻打不通」更誤導，因為它看起來像 healthcheck 指令寫錯了。
`start_period` 的取值依據 MUST 寫進註解，MUST NOT 留一個沒有來歷的數字。

**web 服務 MUST NOT 加 healthcheck**：Vite dev server 起來就能服務，
沒有「行程在但還不能用」的空窗，加了只是多一份要維護的設定。

#### Scenario: `--wait` 在 api 尚未完成編譯時回報成功

- **WHEN** `docker compose up -d --wait` 在 api 仍在 `nest build` 期間返回
- **THEN** 違反本需求——api MUST 在健康端點回應之前維持 unhealthy

#### Scenario: 首次啟動的編譯時間

- **WHEN** 容器首次啟動、`dist/` 為空
- **THEN** healthcheck MUST NOT 在 `start_period` 內把重試次數用盡

#### Scenario: 代理先於後端就緒

- **WHEN** nginx 啟動
- **THEN** MUST 等到 api healthy——否則第一批請求會得到 502，
  而在單一入口的拓撲下那看起來像代理設定壞了
