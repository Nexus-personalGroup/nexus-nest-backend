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

### Requirement: 單一 compose 檔涵蓋三種用途

系統 SHALL 以**單一** `compose.yml` 支援三種用法，靠「指定服務」與 profile 區分：
整套跑在容器（預設 `up`）、只起相依服務（`up mysql redis`）、
重現 CI 的 e2e 環境（`--profile verify`）。

verify 用的 MySQL MUST 獨立成服務而非共用開發用的那個——兩者對資料的要求相反：
開發要 named volume 重啟保留，驗證要 `tmpfs` 每次乾淨。它 MUST 掛在 profile 底下，
使平常的 `up` 不會啟動它。

三者與 CI 的 service container MUST 共用同一條 MySQL 版本線，避免「本機過、CI 掛」。

#### Scenario: 預設啟動整套

- **WHEN** 執行 `docker compose up -d`
- **THEN** api、web、mysql、redis 四個服務啟動，`mysql-verify` MUST NOT 啟動

#### Scenario: 只起相依服務

- **WHEN** 執行 `docker compose up -d mysql redis`
- **THEN** 僅資料庫與快取啟動，api / web 由開發者在 host 執行

#### Scenario: 重現 CI 環境

- **WHEN** 執行 `--profile verify`
- **THEN** 啟動 tmpfs 版 MySQL，測試結束後連同資料卷移除

### Requirement: 對外埠避開預設值且僅綁本機

系統 SHALL 讓所有對外埠避開 MySQL 3306 與 Redis 6379 的預設值，並綁在 `127.0.0.1`。
埠與密碼 MUST 可由 repo 根目錄 `.env` 覆寫。

多數開發機已有一組資料庫在跑，佔用預設埠會讓容器直接起不來；綁 loopback 則避免
開發用服務曝露到區網。

#### Scenario: 機器上已有 MySQL 佔用 3306

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
