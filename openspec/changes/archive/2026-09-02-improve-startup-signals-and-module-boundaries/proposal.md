## Why

清掉 `tasks/todo.md`「技術債（小，隨手可修）」的三條。它們各自獨立，
但前兩條有同一個形狀：**失敗是靜默的，而正確的時機是「啟動時就該炸」**。

**① api 沒有 healthcheck。** compose 只有 postgres / redis / postgres-verify 有，
於是 `docker compose up -d --wait` 對 api **只等到 running**——容器起來了但
`nest build` 還在跑、Prisma 還沒連上的那段空窗，`--wait` 已經回報成功。
`enforce-single-entry-container` 關掉直連埠之後這件事變得更難查：
唯一的入口是代理，「起來了卻打不通」的第一直覺會變成「代理壞了」。

**② 18 個布林環境變數用寬鬆解析。**
`z.string().default('false').transform(v => v === 'true')` 把任何非 `'true'`
的值都當成 false——`SMTP_SECURE=TRUE`（大寫）或 `=1` 會**靜默失效**。
`SWAGGER_ENABLED` 與 `CHAT_AUDIT_ENABLED` 已改用 `z.enum(['true','false'])`，
其餘 18 個還沒。

**③ `RevokeMemberSessionsService` 住在 `chat-ws.module` 裡。**
於是三個 admin 模組（`member` / `front-user` / `front-user-suspension`）
只是為了「停權要踢掉既有連線」，就得 import 整個聊天 WS 連線層——
gateway、連線限流、Socket.IO adapter 全部一起進來。

**todo 說③「成本很小」是低估。** 實際查過相依後：`RevokeMemberSessionsService`
只依賴 `EVENT_PUBLISHER_PORT`，而那個 port 由 `SocketIoEventPublisher` 提供、
住在 `ChatWsModule` 裡。**單純抽一個 `SessionRevocationModule` 出來，
它還是得 import `ChatWsModule`**——DI 圖一點沒變小，只有宣告讀起來好看。
真正解得掉要再往下抽一層（見 design D3）。

## What Changes

- **api 服務加 healthcheck**（`wget -qO- http://localhost:3000/api/health`），
  並配 `start_period` 涵蓋容器內的編譯時間；`nginx` 的 `depends_on: api`
  升級為 `condition: service_healthy`。
- **18 個布林環境變數改用 `z.enum(['true','false'])`**，預設值逐一維持原樣。
  **新增守則**擋住寬鬆寫法回歸。
- **抽出兩個模組**：`EventPublisherModule`（提供 `EVENT_PUBLISHER_PORT`）與
  `SessionRevocationModule`。五個模組改指向它們，
  **三個 admin 模組從此不再相依 `ChatWsModule`**。**新增守則**擋住回歸。

**不做**：不動 `web` 服務的 healthcheck（Vite 起來就是好的，見 design D1）；
不改任何環境變數的預設值或語意；不動 `RevokeMemberSessionsService` 本身的實作。

## Capabilities

### Modified Capabilities

- `platform-container-dev`：新增「應用容器的就緒判定」——
  既有的「資料庫容器的就緒判定」只涵蓋 DB。
- `platform-engineering-guardrails`：新增兩條——
  「布林環境變數必須用列舉宣告」與「admin 模組不得相依 WebSocket 連線層」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | **無新增、無移除、預設值不變**；但**寫錯值會從靜默忽略變成啟動失敗**（見下） |
| API 契約 / Swagger | 無 |
| 前端 | 無 |
| 部署相依 | 無需重跑 seed |

⚠️ **本機 `.env` 若有布林變數寫成 `1` / `TRUE` / `yes`，API 會啟動失敗。**
`docker/api.container.env` 與 CI workflow 都沒有設任何布林變數，那兩邊不受影響；
但開發者自己的 `apps/api/.env` 無從檢查。**那個失敗正是本次改動的目的**
（現在是靜默當成 false），修法是把值改成 `true` 或 `false`。
