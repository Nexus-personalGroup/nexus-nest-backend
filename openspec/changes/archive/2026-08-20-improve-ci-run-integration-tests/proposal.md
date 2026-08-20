## Why

M1 交付了兩樣東西：跨實例廣播的能力，以及證明它成立的 11 條測試。但那些測試**只有人手動跑才會執行**——CI 跑的是 unit + e2e，而 e2e 刻意把 Redis mock 掉。

也就是說：**目前 CI 全綠不代表跨實例廣播還活著。** 有人拿掉 `@socket.io/redis-adapter`、改壞 `RedisIoAdapter` 的掛載時機、或動壞 presence 的心跳續期，CI 一樣通過。

而 M2 要在 WS 層加訊息、房間、ack、去重、斷線補齊——**大量改動集中在剛建好的那層，正是最可能弄壞它的時候**。保護傘的洞要在下雨前補。

這也正是 `platform-engineering-guardrails` 記載過的缺陷型態：**設定寫了但沒有執行路徑**。測試存在、正確、會失敗，只是沒有任何自動流程會執行它。

## What Changes

- `.github/workflows/ci.yml` 新增 `integration` job，執行 `pnpm --filter @app/api test:integration`
- **CI 首次需要 Redis service container**——至今不需要是因為 e2e 把 Redis mock 掉了；跨實例廣播完全建立在 Redis pub/sub 之上，mock 掉等於把要驗的東西拿掉
- `test/setup/setup-env.integration.ts` **明確宣告 Redis 連線**：目前它沒設 `REDIS_HOST` / `REDIS_PORT`，靠 `envSchema` 的預設值（`localhost:6379`）碰巧對上 CI 的 service container。本機則是靠 `.env` 提供 6389。這是巧合不是設計
- `openspec/project/tooling.md` 的 CI job 表補上新 job

## Capabilities

### Modified Capabilities

- `platform-ci-quality-gate`：新增一條需求——**跨實例的保證必須在 CI 驗證**。既有需求（「e2e 必須在 CI 對真實資料庫執行」）是在整合測試存在之前寫的，涵蓋不到「多個實例之間」這個維度

## Impact

- **CI 執行時間增加**：整合測試本機約 7 秒，加上起兩個 NestJS 實例與 service container 的等待，預估 pipeline 增加 1–2 分鐘
- **無程式碼改動**：僅 workflow 與測試環境設定
- **需使用者觀察**：首次 run 要確認 runner 上兩個實例佔埠（34101 / 34102）不衝突、Redis service 連得上
- 不影響本機開發流程；`pnpm --filter @app/api test:integration` 的行為不變
