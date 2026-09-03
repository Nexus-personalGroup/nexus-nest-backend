## ADDED Requirements

### Requirement: 連線類環境變數必須在 compose 釘死

系統 SHALL 確保 `envSchema` 中所有連線類變數（名稱以 `_HOST` / `_PORT` / `_URL`
結尾）都出現在 `compose.yml` 的 api 服務 `environment:` 區塊，
未釘死者 MUST 列於顯式豁免清單並寫明理由。

容器會以 `env_file` 讀入開發者本機的 `apps/api/.env`
（見 `platform-container-dev` 的「連線類設定不得被 host 的環境檔覆寫」）。
compose 的 `environment:` 優先序最高，所以**釘死就是保護**——
反過來說，**沒釘死的連線類變數會直接採用 host 的值**，
而那個值多半指向 `localhost`，在容器裡連不到。

**症狀是靜默的**：Redis 連不上會降級運行（不是報錯），
SMTP 連不上要到真的寄信才失敗，而信件連結錯了根本不會失敗。
所以這條規則要在**新增變數的當下**失敗，而不是等有人遇到。

豁免 MUST 有理由。**沒有豁免機制的規則會被整條關掉**——
前台網站的位址（`APP_FRONT_URL`）與公開路徑（`LOCAL_MEDIA_BASE_URL`）
不是容器要連出去的目標，釘死等於逼所有開發者用同一個前台設定。

檢查 MUST 同時確認掃描範圍有效（`envSchema` 與 compose 的 api `environment:`
都讀到非空的集合），掃不到就失敗。

**本規則檢查「有沒有釘」，不檢查「值對不對」**——後者需要知道每個變數的語意。
值的正確性由實機驗收負責；規則負責的是「新增連線類變數時，
有沒有人想過它在容器裡該是什麼」，而那正是漏掉時完全沒有徵兆的部分。

#### Scenario: ⭐ 新增一個連線類變數但忘了在 compose 釘死

- **WHEN** `envSchema` 新增 `FOO_URL` 而 compose 的 api `environment:` 沒有它，
  也不在豁免清單
- **THEN** 檢查失敗，訊息說明它會直接採用 host `.env` 的值

#### Scenario: 豁免清單有過期項目

- **WHEN** 豁免清單列有 `envSchema` 已不存在的變數
- **THEN** 檢查失敗——那是變數移除後遺留的死字串

#### Scenario: 掃描範圍失效

- **WHEN** compose 結構改變導致讀不到 api 的 `environment:` 區塊
- **THEN** 檢查 MUST 失敗而非默默通過
