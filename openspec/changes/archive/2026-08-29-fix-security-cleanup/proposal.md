## Why

2026-08-22 專案審查報告的 🔴 都修完了（change 1、2、6），剩下五項 🟡🟢
——**逐項確認過，現在仍未修**。它們的共同性質是：每一個都在「還沒出事，
但出事時會放大」的位置上，而且都不會有任何徵兆告訴你它壞了。

現在做的理由是**它們會互相放大**：CSP 全關 × refresh token 存 localStorage ×
7 天效期，串起來是「後台任一處 XSS → 可自我續期的 7 天完整帳號接管」；
Redis fail-open 讓暴力破解在 Redis 掛掉期間完全不受限，而那正是最可能被挑的時機。
單看每一項都「還好」，串起來不是。

## What Changes

- **CSP 不再全關**：只對 `/api/admin/docs` 與 `/api/front/docs` 兩條路徑放寬
  （Swagger UI 依賴 inline script/style），其餘路徑套 helmet 預設 CSP。
  現況的註解前提是「純 API + 獨立前端」，但單一埠部署模式下後台 SPA
  由同一個 Express 服務——前提在部署形態改變時失效了，註解沒跟著改。
- **`REFRESH_TOKEN_EXPIRES_IN` 預設從 7 天壓到 1 天**（604800 → 86400）。
  **BREAKING（部署面）**：既有前端 session 會在一天後要求重新登入；
  沒有資料或 API 契約變更。
- **Redis fail-open 變成可觀測**：`recordFailedLogin` / `recordFailedIpAttempt`
  在 Redis 不可用時仍然放行（graceful degradation 是刻意的、本次不推翻），
  但必須留下警告與指標。現在**完全沒有痕跡**。
- **心跳加防重入與批次送出**：`sendHeartbeats()` 目前迴圈內序列 `await`，
  且 `setInterval` 沒有 in-flight 旗標——上一輪沒跑完下一輪照開，
  堆疊之後只會更慢，續期落後超過 presence TTL 就開始誤判離線。
- **修掉四處文件漂移**，其中「守則數量」那條**用守則自己釘住**
  （`test:arch` 自我斷言），其餘三處靠人維護。

## Capabilities

### Modified Capabilities

- `platform-public-surface`：新增「CSP 的適用範圍」需求——預設全站啟用，
  只有 API 文件路徑豁免。順帶補上這支 spec 的 `## Purpose`（目前是 archive
  留下的 `TBD`）。
- `platform-token-scope`：修改 refresh token 效期需求，並明訂
  「token 存放位置與效期是一組**綁在一起**的決定」——存 localStorage
  就不能配長效期。順帶補上 `## Purpose`（目前是 `TBD`）。
- `platform-observability`：新增「安全防護降級必須可觀測」需求——
  凡是 Redis 不可用時選擇放行的防護路徑，都必須留下警告與指標。
- `platform-websocket-transport`：修改心跳需求——加上「不得重入」與
  「續期延遲必須遠低於 presence TTL」兩條保證。
- `platform-engineering-guardrails`：新增「守則清單的基準值必須自我維護」
  需求——寫死在文件裡的數字會過期，而過期的基準值比沒有基準值更糟。

## Impact

**程式碼**：

| 檔案 | 改動 |
| --- | --- |
| `apps/api/src/main.ts` | helmet CSP 改為分路徑 |
| `apps/api/src/infrastructure/validate-env.ts` | `REFRESH_TOKEN_EXPIRES_IN` 預設值 |
| `apps/api/src/adapter/out/persistence/auth/PrismaAccountLockAdapter.ts` | 降級時記錄警告 + 指標 |
| `apps/api/src/adapter/in/ws/ChatGateway.ts` | in-flight 旗標 + 批次心跳 |
| `apps/api/src/infrastructure/redis/redis.service.ts` | 批次 heartbeat 所需的多鍵操作 |
| `apps/api/src/infrastructure/logger.ts` | 兩處註解（Express 而非 Fastify；直讀 env 是刻意的） |
| `CLAUDE.md`、`openspec/project/backend-runtime.md` | 文件漂移 |

**測試**：新增守則 `guardrail-inventory`（守則數量自我斷言）；
`platform-observability` 與心跳防重入各需單元測試；CSP 需 e2e 驗 header。

**沒有**：schema 變動、migration、新環境變數、API 契約變更。

**部署**：`REFRESH_TOKEN_EXPIRES_IN` 若在 `.env` 顯式設過，改預設值不影響該環境
——要一併調整才會生效。
