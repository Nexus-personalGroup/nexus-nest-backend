## ADDED Requirements

### Requirement: 代理的 upgrade 標頭必須是條件式

反向代理轉發時，`Connection` 標頭 SHALL 依請求是否帶 `Upgrade` 決定，
MUST NOT 寫死字面值 `"upgrade"`。

寫死時**每一個普通 HTTP 請求**都會帶著 `Connection: upgrade` 送到上游
（`$http_upgrade` 為空時 nginx 會省略 `Upgrade` 標頭，但 `Connection` 是字面字串，
一定會送）。上游收到一個沒有 `Upgrade` 的 `Connection: upgrade`，
依 RFC 7230 是畸形的；實務上 Node 不會把它升級，但會把連線標成不可重用。

**這個問題是潛伏的**：`upstream` 沒有 `keepalive` 指令時本來就不重用上游連線，
所以現在沒有可觀察的症狀。**但那正是它危險的地方**——
哪天有人為了效能加上 `keepalive`，它會安靜地不生效，
而症狀是「加了 keepalive 但沒有變快」，沒有任何東西會失敗。

實作 SHOULD 用 `map $http_upgrade $connection_upgrade`（在 `http` 區塊定義一次），
MUST NOT 在 `location` 內用 `if` 判斷——nginx 的 `if` 在 `location` 內
有已知的求值陷阱，而 `map` 正是為這件事設計的。

#### Scenario: ⭐ 普通 HTTP 請求

- **WHEN** 一個不帶 `Upgrade` 的請求經由代理轉發
- **THEN** 送到上游的 `Connection` MUST NOT 是 `upgrade`

#### Scenario: WebSocket 升級請求

- **WHEN** 一個帶 `Upgrade: websocket` 的請求經由代理轉發
- **THEN** 連線 MUST 升級成功（HMR 與聊天都依賴它）

### Requirement: 代理設定必須寫明哪些路徑不該對外

反向代理的設定檔 SHALL 同時記載兩件事：**新路由該掛在哪**，
以及**哪些既有路徑不該從外面進來**。

目前只有前者（「加後端路由前先確認落在 `/api` 或 `/socket.io` 底下」），
那管的是**漏掛**。缺的是反向的那一半——至少
`/api/metrics`（`JwtAuthGuard` 明確豁免認證）與 `/api/*/docs`、`/api/*/docs-json`
（完整後台結構）在正式環境需要排除或另行保護。

**開發環境 MUST NOT 實際封鎖它們**：dev 需要打得到 `/api/admin/docs`，
封鎖會擋掉日常使用。要求的是**記載**，不是封鎖——
真正的封鎖屬於正式環境的設定，而那份設定尚不存在，
為一個沒有形狀的東西先寫規則只會寫錯。

這條之所以必要，是因為該檔案自己宣告了它是正式拓撲的樣板
（「讓開發時的拓撲與正式的單一埠部署一致」），**而樣板會被抄**。

#### Scenario: ⭐ 有人把 dev 的代理設定抄去正式環境

- **WHEN** 讀該設定檔以建立正式環境的代理
- **THEN** 檔案 MUST 已經指出 `/api/metrics` 與文件路徑需要另行處理

#### Scenario: 開發環境仍可存取 Swagger

- **WHEN** 開發者經由代理開 `/api/admin/docs`
- **THEN** MUST 正常可用——本需求不要求在 dev 封鎖任何路徑

### Requirement: 所有對外埠都必須可由根目錄環境檔覆寫

`compose.yml` 宣告的每一個對外埠 SHALL 可由 repo 根目錄的 `.env` 覆寫，
MUST NOT 有寫死的埠號。repo MUST 提供根目錄的 `.env.example` 列出這些變數。

「對外埠都可以調」如果只是**大部分正確**，那句話就不能用——
要調埠的人得先逐一確認哪個可以。驗證用資料庫的埠只在
`--profile verify` / `e2e` 期間開啟、跑完即拋，撞埠機率低，
但那是「不太會痛」而不是「可以不一致」。

`.env.example` MUST 說明它與 `apps/api/.env` 的分工：
前者是 compose 展開 `${...}` 時讀的**基礎設施設定**（埠、開發密碼），
後者是 `envSchema` 讀的**應用程式設定**。**改埠時兩份要成對改**，
而漏改的症狀只是 connection refused，指不到是哪一份。

#### Scenario: ⭐ 調整驗證用資料庫的埠

- **WHEN** 在根目錄 `.env` 設定對應變數
- **THEN** `--profile verify` 與 `verify:ci` 都採用該值，MUST NOT 只有其中一處生效

#### Scenario: 沒有 `.env` 時

- **WHEN** repo 根目錄沒有 `.env`
- **THEN** 所有埠採用 compose 的內建預設值，行為與現況一致
