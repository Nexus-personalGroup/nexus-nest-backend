## Context

三條 todo 上的技術債，都標著「併進下一個會動到 X 的 change」而一直沒有那個 change。
這支就是那個 change——不是因為湊到了一起，是因為它們**都在等一個不會自己出現的時機**。

前兩條共享一個形狀：**失敗是靜默的**。`--wait` 說 ready 但其實沒 ready、
`SMTP_SECURE=1` 被當成 false，兩者都不會報錯，只會讓後面某個現象變得無法解釋。
第三條是結構問題，形狀不同，但同樣是「不主動處理就永遠不會被處理」。

## Goals / Non-Goals

**Goals:**

- `docker compose up -d --wait` 回報成功時，api 真的可以接請求。
- 布林環境變數寫錯值時**在啟動時失敗**，而不是靜默走預設。
- 三個 admin 模組不再把整個 WS 連線層拉進 DI 圖。
- 三件事都配守則——沒有守則的話它們會慢慢回來。

**Non-Goals:**

- **不動 `web` 的 healthcheck**（見 D1）。
- 不改任何環境變數的預設值、語意或名稱。
- 不動 `RevokeMemberSessionsService` 的實作，只搬它的宣告位置。

## Decisions

### D1：只給 api 加 healthcheck，web 不加

api 值得加是因為它有**真正的就緒條件**：`nest build` 產出 `dist/main.js`、
Prisma 連上資料庫、Nest 完成 bootstrap。這些完成之前它會拒絕連線，
而 `--wait` 看不出差別。

web 不加：Vite dev server 起來就能吐頁面，沒有「行程在但還不能服務」的空窗。
硬加一個 healthcheck 只是多一份要維護的設定，換不到任何訊號。

**`start_period` 是必要的，不是保險。** 容器內 `nest build` 要數十秒，
沒有寬限期的話 healthcheck 會在編譯完成前把 retries 用光，
而失敗訊息會是「unhealthy」——比原本的「起來了卻打不通」更誤導，
因為它看起來像 healthcheck 指令寫錯了。

### D2：布林用 `z.enum`，不用 `z.coerce.boolean()`

Zod 的 `coerce.boolean()` 走 JS 的 truthy 規則：`'false'` 這個**非空字串是 true**。
用在環境變數上，`FOO=false` 會變成 `true`——比現況更糟。

`z.enum(['true','false'])` 的性質正好是需要的：只接受兩個字面值，
其餘一律在啟動時失敗。已經改過的 `SWAGGER_ENABLED` 與 `CHAT_AUDIT_ENABLED`
用的就是它，本次是把其餘 18 個對齊。

**`.default()` 要逐一保留原值**，不能統一——有幾個預設是 `'true'`
（例如稽核類的安全開關），改錯會靜默關掉功能，而那正是本次要消滅的失敗型態。

**守則的判定寫在 `validate-env.ts` 上**：不得出現
`z.string()` 後面接 `.transform((v) => v === 'true')` 的組合。
這比「檢查每個布林變數」容易寫也不會誤報——`z.enum` 後面接同樣的 transform
是正確寫法（列舉負責驗證、transform 負責轉型），所以判定必須認得
**前面接的是 `.string()` 還是 `.enum()`**。

### D3：抽兩層，不是一層

todo 寫的做法是抽 `SessionRevocationModule`。實際查過相依之後那不夠：

```
RevokeMemberSessionsService  ──依賴──▶  EVENT_PUBLISHER_PORT
                                              │ 由 SocketIoEventPublisher 提供
                                              ▼
                                        住在 ChatWsModule
```

所以 `SessionRevocationModule` 還是得 import `ChatWsModule`，
三個 admin 模組透過它照樣把 gateway 拉進來。**宣告變好看，DI 圖沒變。**

真正解得掉的關鍵是：**`SocketIoEventPublisher` 沒有任何建構子相依**
——它的 `server` 是 gateway 在 `afterInit` 時 `bind()` 進去的，
不是 DI 注入的。因此它可以獨立成 `EventPublisherModule`：

```
EventPublisherModule  ← ChatWsModule（gateway 呼叫 bind）
        ▲
        └─────────────  SessionRevocationModule  ← 三個 admin 模組
```

**單例性是這個拆法成立的前提**：`SocketIoEventPublisher` 必須只被宣告一次
（在 `EventPublisherModule`），其他模組一律 import 而非重新 provide。
重新 provide 會產生第二個實例，而**只有 gateway bind 過的那個有 server**——
另一個會永遠靜默地送不出事件（它的實作刻意在未綁定時記警告而非拋錯）。
這一點寫進模組註解。

**不選「把 EVENT_PUBLISHER_PORT 改成 @Global()」**：全域 provider 會讓
「誰用了它」變成不可搜尋，而本專案已經有一條相反方向的教訓
（`MetricsModule` 不是 `@Global()`，導致 DI 接線斷掉時測試才發現）。
明確 import 的成本是幾行，換來的是可追蹤。

### D4：守則擋「admin 模組不得 import ChatWsModule」

抽完之後，`modules/admin/**` 沒有任何一支需要 `ChatWsModule`——
需要撤銷連線的走 `SessionRevocationModule`，需要推播的走 `EventPublisherModule`。
這讓守則可以寫得很乾脆，不必列例外。

**擋的是回歸而不是無知**：下一個要在 admin 側推播的人，最短路徑就是
`import { ChatWsModule }`，而它會通過 typecheck、通過所有測試、功能也正常。
沒有守則的話這次的抽離會在三個月內被磨平。

## Risks / Trade-offs

- **開發者的 `.env` 可能寫了 `1` / `TRUE`，改完會啟動失敗。**
  這是刻意的（現在是靜默當 false），但會打斷人。`docker/api.container.env`
  與 CI 都沒設任何布林變數，所以只影響本機。
- **healthcheck 的 `start_period` 是猜的。** 太短會誤報 unhealthy，太長則
  `--wait` 在真的壞掉時要等更久才失敗。取 90s——實測容器內首次 build 約 40–60s。
  這個值寫進註解說明它從哪來，而不是留一個沒有來歷的數字。
- **模組抽離不改變任何執行期行為**，因此**單元測試不會變紅也不會變綠**。
  唯一能證明它有效的是守則與 `pnpm build`（Nest 的 DI 在編譯期不檢查，
  接線斷掉要到啟動或 e2e 才知道——這一點本專案踩過）。**因此 e2e 必跑。**

## Open Questions

無。
