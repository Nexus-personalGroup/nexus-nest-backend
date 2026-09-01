## ADDED Requirements

### Requirement: 反向代理必須是單一入口，且不得重複後端已負責的職責

系統 SHALL 提供一個 nginx 服務作為開發環境的單一入口：
`/api/*` 轉給 api，其餘轉給 web，並 MUST 支援 WebSocket upgrade
（Vite 的 HMR 與聊天的 Socket.IO 都走 WS）。

api 與 web 各自的對外埠 MUST 保留——反向代理是**多一條路**，不是取代既有的兩條。

**代理 MUST 轉發來源 IP**（`X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto`），
且應用程式 MUST 設定為採信它（`TRUST_PROXY`）。

不設的後果是**靜默的**：`request.ip` 會變成 nginx 容器的 IP，於是
IP 黑名單擋不到真正的來源、登入失敗計數把所有人算成同一個、
全域節流變成全站共用一份額度。**沒有任何一個會報錯**——
它們都會照常運作，只是判斷的對象全錯。

**代理 MUST NOT 自行加上任何安全標頭**（CSP、X-Frame-Options、
X-Content-Type-Options 等），那些由後端的 helmet 統一負責。
CSP 尤其不可加：後端的 CSP 是**分路徑**的（API 文件路徑放寬、其餘套預設），
在代理層加一份等於把那個判斷整個蓋掉，而且蓋掉之後兩邊都不會失敗。

#### Scenario: 一般 API 請求

- **WHEN** 對代理的 `/api/health` 發出請求
- **THEN** 由 api 服務回應，且回應 MUST 帶後端產生的安全標頭

#### Scenario: 前端頁面請求

- **WHEN** 對代理的 `/` 發出請求
- **THEN** 由 web 服務回應

#### Scenario: WebSocket 連線

- **WHEN** 透過代理建立 WebSocket 連線
- **THEN** 連線 MUST 成功建立——缺少 upgrade 設定時前端的 HMR 與聊天都會斷

#### Scenario: ⭐ 來源 IP 的辨識

- **WHEN** 兩個不同來源的請求經由代理抵達
- **THEN** 應用程式 MUST 分辨得出它們來自不同的 IP，
  MUST NOT 都看成代理自身的位址

#### Scenario: ⭐ 代理層自行加了 CSP

- **WHEN** 代理設定中出現 `add_header Content-Security-Policy`
- **THEN** 違反本需求——後端的分路徑判斷會被覆蓋

#### Scenario: 既有的直連方式

- **WHEN** 直接存取 api 或 web 原本的對外埠
- **THEN** MUST 仍然可用

### Requirement: e2e 的測試行程必須可在容器內執行

系統 SHALL 提供一種讓 **e2e 的測試行程本身**跑在容器內的方式，
使該次執行不依賴 host 的 Node 版本、套件狀態與環境檔。

該路徑 MUST 複用既有的 tmpfs 資料庫服務，MUST NOT 另建一個平行的測試資料庫定義
——兩份定義會各自漂移，而漂移的症狀是「兩種跑法結果不同」。

資料庫連線 MUST 由 compose 的 `environment` 提供，MUST NOT 依賴
`apps/api/.env`——容器內該檔是被遮蔽的（見「容器設定不得受 host 的環境檔影響」）。

執行結束後 MUST 移除容器與資料，**無論測試成功或失敗**。
只在成功時清理的實作 MUST 視為違反本需求：失敗才是最需要重跑的時候，
而殘留的資料會讓下一次執行的結果不可信。

**既有的 host 執行方式 MUST 保留**：那是最快的迭代路徑，
改一行就重跑不必等容器啟動。兩者是不同用途，不是取代關係。

#### Scenario: 在容器內跑完整 e2e

- **WHEN** 執行容器化的 e2e 指令
- **THEN** 測試庫被建立、migration 被套用、所有 spec 執行完畢

#### Scenario: ⭐ 測試失敗時同樣清理

- **WHEN** e2e 有測試失敗
- **THEN** 容器與資料 MUST 仍被移除，且指令 MUST 以非零碼結束

#### Scenario: 不依賴 host 的環境檔

- **WHEN** host 的 `apps/api/.env` 指向本機的資料庫埠
- **THEN** 容器內的 e2e MUST 連到 compose 指定的測試資料庫

#### Scenario: host 執行方式仍可用

- **WHEN** 執行既有的 e2e 指令
- **THEN** MUST 仍然可用，行為不變

## RENAMED Requirements

- FROM: `### Requirement: 單一 compose 檔涵蓋三種用途`
- TO: `### Requirement: 單一 compose 檔涵蓋四種用途`

## MODIFIED Requirements

### Requirement: 單一 compose 檔涵蓋四種用途

系統 SHALL 以**單一** `compose.yml` 支援四種用法，靠「指定服務」與 profile 區分：
整套跑在容器（預設 `up`，含反向代理）、只起相依服務（`up postgres redis`）、
重現 CI 的 e2e 環境（`--profile verify`）、在容器內跑 e2e（`--profile e2e`）。

verify 用的 PostgreSQL MUST 獨立成服務而非共用開發用的那個——兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它 MUST 掛在 profile 底下，
使平常的 `up` 不會啟動它。

**`--profile e2e` MUST 複用 verify 的那個資料庫服務**，MUST NOT 另建一份。

四者與 CI 的 service container MUST 共用同一條 PostgreSQL 版本線，避免「本機過、CI 掛」。

**新增用途 MUST 掛在 profile 或指定服務底下**，MUST NOT 讓預設的 `up`
啟動與開發無關的容器——那會讓「起一次開發環境」的成本隨用途數量成長。

#### Scenario: 預設啟動整套

- **WHEN** 執行 `docker compose up -d`
- **THEN** api、web、nginx、postgres、redis 啟動，
  `postgres-verify` 與 e2e 服務 MUST NOT 啟動

#### Scenario: 只起相依服務

- **WHEN** 執行 `docker compose up -d postgres redis`
- **THEN** 僅資料庫與快取啟動，api / web 由開發者在 host 執行

#### Scenario: 重現 CI 環境

- **WHEN** 執行 `--profile verify`
- **THEN** 啟動 tmpfs 版 PostgreSQL，測試結束後連同資料卷移除

#### Scenario: 在容器內跑 e2e

- **WHEN** 執行 `--profile e2e`
- **THEN** 啟動 tmpfs 版 PostgreSQL 與 e2e 容器，結束後兩者皆移除
