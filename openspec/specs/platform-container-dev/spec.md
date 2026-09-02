# platform-container-dev Specification

## Purpose

定義容器化開發環境的契約：單一 `compose.yml` 支援的三種用法、映像的 dev-only 定位、
`node_modules` 與 host 環境檔的隔離規則，以及前後端熱重載的成立條件。

這裡的需求多數是**踩過才寫得出來的約束**——遮罩漏一個 workspace 會載到 host 的平台產物、
host 的 `.env` 會經 bind mount 汙染容器設定、後端用單一 watch 指令會出現
「編譯成功但改動不生效」而日誌完全正常。把它們寫成可驗收的需求，
是為了讓改動 `Dockerfile` 或 `compose.yml` 的人不必重新踩一次。

操作指令與逐項說明見 `openspec/project/tooling.md`。
## Requirements
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

### Requirement: 映像僅供開發，不宣稱可獨立執行

映像 SHALL 只提供 dev target，其職責是提供「Linux 平台的 node_modules 與工具鏈」，
原始碼由 bind mount 掛入。映像 MUST NOT 宣稱可獨立跑測試——`.dockerignore` 排除了
`openspec` / `.agents` / `*.md`，而有數支架構守則直接讀那些路徑。

MUST NOT 加入未被任何指令或 CI job 使用的 production target。要加時 MUST 同時
補上使用它的執行路徑，且該 target MUST 以非 root 使用者執行。

#### Scenario: 加入沒有執行路徑的建置階段

- **WHEN** 新增一個沒有任何指令會使用的 target
- **THEN** 違反本需求——那是「設定寫了但沒有執行路徑」的典型

### Requirement: 容器內的 node_modules 必須與 host 隔離

系統 SHALL 以 volume 遮蔽 bind mount 帶入的 `node_modules`，且**每一個 workspace 的
位置都要遮**（root 與四個子專案）。遮罩 MUST 使用具名 volume。

pnpm 的各 workspace `node_modules` 是指向根目錄 `.pnpm` store 的 symlink，
漏遮任一處，容器就會載到 host 的平台產物（症狀為原生模組 `invalid ELF header`）。
具名而非匿名是為了讓它們在容器管理介面中可辨識。

**改動依賴後具名 volume 不會自動更新**——volume 只在第一次建立時從映像複製內容。
系統 SHALL 提供一支只重建 `node_modules` volume、保留資料庫與快取資料的指令。

#### Scenario: 只遮了根目錄的 node_modules

- **WHEN** 子專案的 `node_modules` 未被遮蔽
- **THEN** 容器載入 host 的平台產物，原生模組載入失敗

#### Scenario: 改了依賴後需要重建

- **WHEN** 執行只重建 node_modules 的指令
- **THEN** 依賴更新生效，且資料庫與 Redis 的資料 MUST 保留

### Requirement: 容器設定不得受 host 的環境檔影響

系統 SHALL 遮蔽 bind mount 帶入的 `apps/api/.env`，使容器的設定只有兩個來源：
compose 的 `environment` 與 `envSchema` 的預設值。

dotenv 不覆寫既有的 `process.env`，等於「compose 沒設的都由開發者本機的 .env 補」——
其中連線類變數會直接打壞容器（指向 host 的 `localhost` 在容器內連不到），
且容器行為會取決於各開發者本機的設定而無法重現。

#### Scenario: host 的 .env 含容器不適用的連線設定

- **WHEN** 開發者的 `.env` 設有指向 host 的連線 URL
- **THEN** 容器 MUST NOT 採用該值

### Requirement: 前後端皆支援熱重載

系統 SHALL 讓 `apps/api` 與 `apps/web` 的原始碼改動在容器內生效，無需重建映像。

後端 MUST NOT 使用單一的 watch-and-restart 指令：其重啟會與應用的優雅關閉
（資料庫連線池與快取連線的釋放）競爭，新行程搶埠失敗後直接結束，
症狀是**編譯成功但改動不生效**，而日誌看起來完全正常。編譯與執行 MUST 分成兩段，
且編譯輸出目錄 MUST NOT 在每次重建時被清空——清空造成的空窗會讓執行段找不到進入點。

看 host 改動的 watch MUST 採輪詢（bind mount 不傳遞檔案系統事件）；
看容器自身寫出的檔案則不需要。

#### Scenario: 修改後端原始碼

- **WHEN** 在 host 編輯 `apps/api/src` 下的檔案
- **THEN** 容器內重新編譯並以新程式碼提供服務，可由 API 回應內容驗證

#### Scenario: 修改前端原始碼

- **WHEN** 在 host 編輯 `apps/web/src` 下的檔案
- **THEN** dev server 偵測到變更並更新模組

#### Scenario: 編譯成功但行程未更換

- **WHEN** 編譯完成而舊行程仍在服務
- **THEN** 視為熱重載失效——驗收 MUST 以 API 的實際行為為準，不得只看日誌

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

### Requirement: 反向代理必須是單一入口，且不得重複後端已負責的職責

系統 SHALL 提供一個 nginx 服務作為開發環境的單一入口：
`/api/*` 轉給 api，其餘轉給 web，並 MUST 支援 WebSocket upgrade
（Vite 的 HMR 與聊天的 Socket.IO 都走 WS）。

**「單一」是字面意思**：`compose.yml` 的 api 與 web 服務 MUST NOT 宣告 `ports:`。
容器模式下代理是唯一的進入方式。

留一條直連的備援看似無害，實際上它讓「單一 origin」變成可選的——走直連進來時，
CORS、cookie 的 `SameSite`、CSP 的分路徑判斷都不是上線時那條路。更糟的是
**代理設定漂掉時沒有人會發現**，因為日常還有另一條路能用。

要直連 api 或 web 的人走 **host 模式**（`pnpm docker:deps` + `pnpm dev`）——
那條路本來就是 3000 / 5173，不需要在容器模式再開一次。
要分辨「代理壞了還是應用壞了」則從代理容器內部打後端
（`docker compose exec nginx wget -qO- http://api:3000/api/health`），
那比開一個 host 埠更精準：它涵蓋了代理的網路路徑。

**容器模式下的 `CORS_ORIGIN` MUST 指向代理的 origin**，MUST NOT 指向已關閉的
web 埠。指著連不上的位址不會報錯，只會在真的有跨 origin 請求時才炸。

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

- **WHEN** 整套跑在容器裡，連 api 或 web 原本的對外埠
- **THEN** MUST 連不上——那兩個埠不再發布。
  （這條的結論與上一版相反：當時是「MUST 仍然可用」。
  同一個場景保留同一個名字，是為了讓反轉在 diff 裡看得見。）
  要直連請改用 host 模式

#### Scenario: ⭐ 有人把 `ports:` 加回 api 或 web

- **WHEN** `compose.yml` 的 api 或 web 服務出現 `ports:` 宣告
- **THEN** 違反本需求，且 MUST 有自動化檢查會失敗——
  「為了 debug 暫時開一下然後忘了拿掉」是這條規則最可能的破口

#### Scenario: Swagger 與健康檢查的入口

- **WHEN** 容器模式下要開 Swagger 或打健康檢查
- **THEN** MUST 經由代理可達（`/api/*` 之下），
  MUST NOT 因為關閉 api 的對外埠而失去入口

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

