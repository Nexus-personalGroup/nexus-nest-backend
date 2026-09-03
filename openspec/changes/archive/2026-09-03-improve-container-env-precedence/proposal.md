## Why

容器模式**完全不讀** `apps/api/.env`（compose 把 `docker/api.container.env`
掛上去遮蔽它）。於是要在容器裡開一個開關，得改另一個檔——而那個檔**進版控**，
等於把個人的開發偏好變成全隊的設定。

實際踩到：把 `APPLICATION_ACCOUNT_LOCK_ENABLED=true` 寫進 `apps/api/.env`、
重啟容器、畫面完全沒變，**而沒有任何東西說明為什麼**。

**遮蔽當初要保護的東西是對的，但保護的方式擋過頭了。** 實測（compose 5.1.2）：

| 來源 | 優先序 |
| --- | --- |
| compose 的 `environment:` | 最高 |
| `env_file` | 次之 |
| 容器內 `.env`（dotenv） | 再次 |
| `envSchema` 預設 | 最低 |

也就是說**「compose 有設的就贏」是 compose 原生就有的語意**——
危險的連線類變數只要在 `environment:` 釘死，host 的值就不可能覆寫它。
遮蔽額外擋掉的只有「compose 沒設的那些」，而那正是開發者想調的部分。

**但目前的釘死並不完整。** envSchema 的 11 個連線類變數（`*_HOST` / `*_PORT` /
`*_URL`）compose 只設了 4 個。沒設的裡面有 **`REDIS_URL`**，而
`redis-client.factory.ts` 是 `env.REDIS_URL ? url : {host, port}`
——**它一旦從 host 漏進來，compose 釘死的 `REDIS_HOST: redis` 會被整個繞過**。
那正是 compose 註解裡舉的例子。

## What Changes

- **compose 的 api 服務加 `env_file: ./apps/api/.env`（`required: false`）**，
  讓「compose 沒設的」由開發者本機的 `.env` 補。
- **補齊四個危險的連線類變數的釘死**：`REDIS_URL`（空字串，falsy 會走回
  HOST/PORT）、`SMTP_HOST`、`SMTP_PORT`、`API_BASE_URL`。
- **保留 `docker/api.container.env` 的遮蔽掛載**——它仍然是「隊友共用的容器基準」，
  個人偏好走 `.env`（不進版控），共用設定走它（進版控）。
- **新增守則**：連線類變數必須在 compose 的 `environment:` 釘死，
  例外要進顯式豁免清單並寫理由。

**順帶修掉一個潛伏的 bug**：`API_BASE_URL` 預設 `http://localhost:3000`，
而 `enforce-single-entry-container` 關掉 api 的對外埠之後**那個位址從 host 連不到**
——容器模式產生的信箱驗證連結目前是壞的。釘死成代理位址即修正。
寄信在 dev 不會被觸發，所以沒有人發現。

## Capabilities

### Modified Capabilities

- `platform-container-dev`：把「容器設定不得受 host 的環境檔影響」**改名並改寫**為
  「連線類設定不得被 host 的環境檔覆寫」——保護的對象從「整份 env」收斂到
  「真正會打壞容器的那些」，並寫明新的優先序。

### Added Capabilities

- `platform-engineering-guardrails`：新增「連線類環境變數必須在 compose 釘死」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | **無新增**；compose 多釘 4 個既有變數 |
| API 契約 / Swagger | 無 |
| 前端 | 無 |
| 行為變更 | **容器會採用 host `.env` 中 compose 沒設的變數**；容器模式的 `API_BASE_URL` 從壞掉的 `localhost:3000` 變成代理位址 |

⚠️ **這是刻意讓容器行為受本機設定影響**，與原本的需求相反。
交換條件是：連線類由 compose 釘死 + 守則擋住新增時漏釘。
代價寫在 design D3。
