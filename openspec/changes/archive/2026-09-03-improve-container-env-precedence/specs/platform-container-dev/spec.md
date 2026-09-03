## RENAMED Requirements

- FROM: `### Requirement: 容器設定不得受 host 的環境檔影響`
- TO: `### Requirement: 連線類設定不得被 host 的環境檔覆寫`

## MODIFIED Requirements

### Requirement: 連線類設定不得被 host 的環境檔覆寫

容器的**連線類設定**（`*_HOST` / `*_PORT` / `*_URL`）SHALL 由 compose 的
`environment:` 釘死，MUST NOT 可被開發者本機的 `apps/api/.env` 覆寫。

其餘變數 MAY 由本機 `.env` 補足：compose 的 api 服務 SHALL 以
`env_file`（`required: false`）讀入 `apps/api/.env`，
使優先序為 **compose `environment:` > `env_file` > 容器內 `.env` > `envSchema` 預設**。

**本需求取代了先前的「完全遮蔽」寫法。** 那個寫法解決的是真實問題
（host 的 `REDIS_URL` 指向 `localhost:6379`，容器內連不到），但把
「不要讓連線設定被打壞」實作成「完全不讀」——代價是每次要在容器調一個開關，
都得改一個**進版控**的檔，等於把個人偏好變成全隊設定。
而「compose 有設的就贏」本來就是 compose 的原生語意，
釘死即可達成保護，不需要遮蔽整份檔案。

**釘死 MUST 涵蓋會讓保護失效的間接路徑。** 例如 `REDIS_URL` 若未釘死，
即使 `REDIS_HOST` 已釘死也會被繞過——連線工廠是
「有 URL 就用 URL，否則才用 HOST/PORT」。**釘死一半等於沒釘。**

前台網站的位址與公開路徑（例如 `APP_FRONT_URL`、`LOCAL_MEDIA_BASE_URL`）
MAY 豁免：它們不是容器要連出去的目標，釘死等於逼所有開發者用同一個前台位址。
豁免 MUST 是顯式清單並寫明理由（見 `platform-engineering-guardrails`）。

`docker/api.container.env` 的遮蔽掛載 SHALL 保留，作為**隊友共用的容器基準**：
進版控的共用設定寫在該檔，不進版控的個人偏好寫在 `apps/api/.env`。

#### Scenario: host 的 .env 含容器不適用的連線設定

- **WHEN** 開發者的 `.env` 設有指向 host 的連線 URL（例如 `REDIS_URL`）
- **THEN** 容器 MUST NOT 採用該值——compose 的 `environment:` 覆蓋它

#### Scenario: ⭐ host 的 .env 設了 compose 沒設的開關

- **WHEN** 開發者在 `.env` 設 `APPLICATION_ACCOUNT_LOCK_ENABLED=true`
- **THEN** 容器 MUST 採用該值——這正是本次改動要達成的事

#### Scenario: ⭐ 間接繞過釘死的路徑

- **WHEN** 某個連線類變數（如 `REDIS_URL`）會使另一個已釘死的變數
  （如 `REDIS_HOST`）失效
- **THEN** 兩者 MUST 都被釘死

#### Scenario: 沒有 apps/api/.env 時

- **WHEN** 開發者尚未建立 `apps/api/.env`
- **THEN** 容器 MUST 正常啟動（`env_file` 宣告為 `required: false`）

### Requirement: e2e 的測試行程必須可在容器內執行

系統 SHALL 提供一種讓 **e2e 的測試行程本身**跑在容器內的方式，
使該次執行不依賴 host 的 Node 版本、套件狀態與環境檔。

該路徑 MUST 複用既有的 tmpfs 資料庫服務，MUST NOT 另建一個平行的測試資料庫定義
——兩份定義會各自漂移，而漂移的症狀是「兩種跑法結果不同」。

資料庫連線 MUST 由 compose 的 `environment` 提供，MUST NOT 依賴
`apps/api/.env`。該服務 MUST NOT 宣告 `env_file`——
容器內的 `apps/api/.env` 是被遮蔽的空檔，而**不讀 host 的環境檔正是這條路徑的目的**：
它要密封、與 CI 同形。這與 api 服務刻意讀入 `apps/api/.env` 是相反的取捨，
因為兩者要的東西不同（開發要方便調整，驗證要可重現）。

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

#### Scenario: ⭐ 容器化 e2e 不受開發者環境檔影響

- **WHEN** 開發者的 `apps/api/.env` 設有功能開關
- **THEN** 容器化 e2e MUST NOT 採用它們——該服務不宣告 `env_file`
