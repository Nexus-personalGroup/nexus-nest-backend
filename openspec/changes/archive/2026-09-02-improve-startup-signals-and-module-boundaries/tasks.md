> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **第 3 塊必須加跑 `pnpm build` 與 `pnpm --filter @app/api test:e2e`**——
> Nest 的 DI 接線在編譯期不檢查，斷掉要到啟動或 e2e 才知道（本專案踩過：
> `@Inject(METRICS_PORT)` 打掛 10 支 e2e 而 typecheck / lint / test 全綠）。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：三塊互相獨立，可任意順序。但每塊的守則要在該塊的改動之後
> ——否則守則會是紅的。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、前端變更。**

## 1. api 的就緒判定

- [x] 1.1 `compose.yml` 的 api 服務加 healthcheck：
      `wget -qO- http://localhost:3000/api/health`（容器內打自己，不經代理）
- [x] 1.2 ⭐ **我第一版寫了「實測 40–60s」而那是沒量就寫的**——正是本條要防的事。
      實際量：刪掉 `dist/` 與 `.tsbuildinfo` 後重啟，**6 秒**就 healthy（熱機器）。
      改成 `60s`，並在註解寫明「6s 是量到的、60s 是給沒量到的情境（`docker:renew`
      之後的首次啟動、較慢的機器）的餘裕」，以及代價（應用真壞掉時要等 ~85s 才失敗）
- [x] 1.3 `nginx` 的 `depends_on: api` 改為 `condition: service_healthy`
- [x] 1.4 ⭐ **web 不加 healthcheck**，並在 api 的註解說明為什麼只有 api 要
      （Vite 起來就能服務，沒有「行程在但還不能用」的空窗）
- [x] 1.5 驗證：`pnpm docker:down && pnpm docker:up`，`--wait` 返回後
      **立刻** `curl http://127.0.0.1:8080/api/health` 應為 200（不需再等）
- [x] 1.6 ⭐ 反向驗證：**做了但沒能構造出失敗案例**——`start_period: 5s` 加上刪掉
      `dist/`，仍然 6–11 秒就 healthy。因此 `60s` 是餘裕而非量出來的需求，這點已寫進註解。
      **健康檢查本身的反向驗證倒是意外達成了**：第一版用 `wget` 時容器永遠 unhealthy
      （node 的 Debian 映像沒裝 wget / curl），換成 `node -e fetch` 後才 healthy

## 2. 布林環境變數改用列舉

- [x] 2.1 `validate-env.ts`：18 處 `z.string().default(...).transform(...)`
      改為 `z.enum(['true','false']).default(...).transform(...)`
- [x] 2.2 ⭐ **`.default()` 逐一保留原值**，不得統一——有幾個預設是 `'true'`，
      改錯會靜默關掉功能，而那正是本次要消滅的失敗型態
- [x] 2.3 ⭐ 不用 `z.coerce.boolean()`（見 design D2：`'false'` 是非空字串，會變成 true）
- [x] 2.4 新增守則：`validate-env.ts` 不得出現 `.string()` + `=== 'true'` 的組合
- [x] 2.5 ⭐ 守則要判別 transform **前面接的是 `.string()` 還是 `.enum()`**
      ——接在 `z.enum` 後面是正確寫法，誤報會逼人把守則關掉
- [x] 2.6 ⭐ 斷言掃描範圍有效（真的掃到了布林宣告），掃不到就失敗
- [x] 2.7 ⭐ 反向驗證：把任一個改回 `.string()` 寫法 → 紅；
      加一個 `z.enum` + 同樣 transform 的新變數 → **必須綠**（不得誤報）；還原 → 綠
- [x] 2.8 `openspec/project/backend-*.md` 沒有描述 env 的布林寫法，無需同步

## 3. 抽出 EventPublisherModule 與 SessionRevocationModule

- [x] 3.1 新增 `modules/event-publisher.module.ts`：提供並匯出
      `SocketIoEventPublisher` 與 `EVENT_PUBLISHER_PORT`
- [x] 3.2 ⭐ 在該模組寫明**單例性是這個拆法成立的前提**——
      重新 provide 會產生第二個實例，而只有 gateway `bind()` 過的那個有 server；
      另一個會**永遠靜默地送不出事件**（實作在未綁定時記警告而非拋錯）
- [x] 3.3 新增 `modules/session-revocation.module.ts`：import `EventPublisherModule`，
      提供並匯出 `REVOKE_MEMBER_SESSIONS_USE_CASE`
- [x] 3.4 `ChatWsModule`：移除這兩者的 provider，改為 import `EventPublisherModule`。
      ⚠️ **`exports` 一開始留著 `EVENT_PUBLISHER_PORT`，那是錯的**——Nest 不能
      re-export 自己沒 provide 的 token。typecheck / lint / test / **build 全綠**，
      e2e **409 支全紅**。最後 `exports: []`：抽完之後沒有人需要從它拿 provider
- [x] 3.5 三個 admin 模組（`member` / `front-user` / `front-user-suspension`）
      的 `ChatWsModule` 改為 `SessionRevocationModule`
- [x] 3.6 `admin/moderation.module` 的 `ChatWsModule` 改為 `EventPublisherModule`
      （它要的是 `EVENT_PUBLISHER_PORT`，不是連線層）
- [x] 3.7 `front/chat-room.module` 只需要推播 → 改指向 `EventPublisherModule`。
      結果是**只剩 `app.module` 還 import `ChatWsModule`**（為了註冊 gateway），
      那正是連線層該有的相依形狀
- [x] 3.8 ⭐ `member-context.module` 那段**已經過期**：它寫「MemberModule 相依
      ChatWsModule，而 ChatWsModule 又 import 本模組」——後半句現在（其實當時也）不成立，
      而前半句在本次之後也不成立了。規則保留、理由換成一般性的（葉節點才安全），
      並註明是哪一支 change 讓舊理由失效。`chat-room-core.module` 那段仍然成立，不動
- [x] 3.9 新增守則：`src/modules/admin/` 不得 import `ChatWsModule`
- [x] 3.10 ⭐ 反向驗證：把任一個 admin 模組改回 import `ChatWsModule` → 紅；還原 → 綠
- [x] 3.11 ⭐ **`pnpm build` + e2e 必跑——而且這次真的抓到了**（見 3.4）。
      build 綠但 e2e 409 全紅，證明「build 過」不等於「DI 組得起來」
- [x] 3.12 `session-revocation.spec.ts`（既有守則）須維持綠

## 4. 收尾

- [x] 4.1 `openspec/project/testing.md` 的守則表補上新增的三支
- [x] 4.2 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.3 `openspec validate --specs --strict` 通過
- [x] 4.4 `tasks/todo.md`：移除已完成的三條技術債
      ——**保留「`domain/exception` 攤平」那條**，它明確寫著現在不要做
- [x] 4.5 `tasks/lessons.md`：補兩條——「Nest 不能 re-export 沒 provide 的 token，只有 e2e 抓得到」與「寫『實測 N 秒』之前要真的量」
- [x] 4.6 `openspec archive improve-startup-signals-and-module-boundaries`
