## Context

repo 目前沒有任何即時通訊層。M1 要建的是「連線能站得住」這件事本身，不含業務。

參考對象是 `netspace/eden`——同一個人寫的前一版聊天室，跑得起來但撞到天花板。它的問題不是寫得差，而是**幾個當下看起來合理的決定，累積成無法水平擴展**：presence 存記憶體 `Map`、沒裝 redis-adapter、gateway 肥到 544 行、WS 認證重寫了一份而與 HTTP 的行為分歧。M1 的設計基本上就是逐條避開這些。

探索既有程式碼時發現的三件事直接影響設計：

1. `JwtAuthGuard` 有六段實質邏輯（黑名單、JWT 驗證、token type、MemberContext 快取與 fallback、`tokenVersion` 比對、密碼到期）。**eden 的 `WsJwtGuard` 把這些重寫了一份，且漏掉 `tokenVersion` 比對**——等於「強制登出所有裝置」對 WS 連線無效。
2. `layering.spec.ts` 只掃 `*Controller.ts`，`dto-from-zod.spec.ts` 與 `authorization-coverage.spec.ts` 只掃 `adapter/in/web`。新的 WS 層**不在任何一條守則的涵蓋範圍內**。
3. `RedisService` 只有 `set/get/del/increment` 與黑名單、節流用的原語，**沒有 Hash 操作、沒有 pub/sub**。presence 需要前者，adapter 需要後者。

## Goals / Non-Goals

**Goals:**

- 連線能認證、能維持、能在多實例間廣播
- **驗收＝起兩個 API 實例，A 實例送出的訊息 B 實例的連線收得到**。這是唯一真正重要的驗收條件，其餘都是為了達成它
- 在線狀態不因單一實例重啟或死亡而留下殭屍
- WS 層的工程約束由守則強制，不靠自律

**Non-Goals:**

- **不做任何聊天業務**：訊息、房間、已讀、輸入中全部屬於 M2。M1 只提供「一個已認證的連線可以加入群組並收到廣播」
- 不做訊息持久化，不動資料庫 schema
- 不做 ack / 去重 / 斷線補齊（M2）
- 不做監控埋點（M3）——但 port 的介面設計要讓 M3 能掛上去而不必回頭改
- 不處理 WS 的水平擴展調校（連線數上限、sticky session 策略），先確認機制正確

## Decisions

### D1：Socket.IO + `@socket.io/redis-adapter`

已確認的選擇。理由：M1 的驗收條件（跨實例廣播）裝上 adapter 即成立，而 M2 需要的 ack callback、房間、自動重連 Socket.IO 都有現成實作。

**不選原生 `ws`**：M1 加 M2 的工作量至少翻倍，且自己實作重連與 ack 的錯誤率遠高於用成熟實作。

**不選「Socket.IO 但自建跨實例廣播」**：曾考慮不裝 adapter、自己用 Redis pub/sub 串接，好處是完全掌控。但 adapter 要處理的不只是「把訊息丟到別的實例」——還有 `fetchSockets` / `socketsJoin` / `disconnectSockets` 這些跨實例操作的請求-回應協定。自己寫等於重做一遍且更容易錯。

### D2：抽出共用的 token 解析，不為 WS 重寫一份

**這是 M1 最重要的一條。** eden 的 `WsJwtGuard` 重寫了 HTTP guard 的邏輯，結果漏掉 `tokenVersion` 比對——**帳號被強制登出後，既有的 WS 連線仍然有效**。這種分歧不會有任何徵兆，要等到安全事件才發現。

做法：把 `JwtAuthGuard.canActivate` 中「token → MemberContext」那段抽成 `application/service/shared/ResolveMemberContextService`（實作 `ResolveMemberContextUseCase` port）：

```
ResolveMemberContextService.resolve(token) → MemberContext
  ├─ 黑名單檢查
  ├─ JWT 驗證 + type === 'access'
  ├─ MemberContext 快取（含損毀 fallback 到 DB）
  ├─ status 檢查
  └─ tokenVersion 比對
```

`JwtAuthGuard`（HTTP）與 WS 的認證都呼叫它。差別只在**取 token 的方式**與**失敗時的表現形式**（HTTP 拋 `UnauthorizedException`，WS 送錯誤事件後斷線）。

密碼到期檢查（`checkPasswordExpiry`）**留在 HTTP guard**，不進共用 service：它會拋 `PasswordChangeRequiredException` 引導使用者去改密碼頁，對 WS 連線沒有對應的處置流程。

**風險緩解**：這是動既有的全域 guard，`JwtAuthGuard.spec.ts` 與全部 e2e 是安全網。抽取後行為必須完全不變，由「測試零修改即通過」證明——若需要改測試，代表行為變了。

### D3：Presence 用 Redis Hash + 心跳，不用 Set

**資料結構**：

```
key    presence:member:{memberId}          （Hash，帶 TTL）
field  {instanceId}:{socketId}
value  最後心跳的 epoch ms
```

**為什麼不用 Set**：Set 的成員沒有各自的過期時間。實例被 `kill -9` 時來不及執行 disconnect 清理，它的成員會永久留在 Set 裡——**該使用者會被永遠顯示為在線**。這正是「用記憶體 Map」之外的第二種殭屍來源。

用 Hash 把時間戳存在 value，讀取時過濾掉超過 `3 × 心跳間隔` 的欄位，殭屍就只會存在最多三個心跳週期，且不需要任何額外的協調機制。

**三道清理**：
1. 正常斷線 → `HDEL`
2. 心跳 → 更新自己的 field + 續期整個 key 的 TTL
3. 讀取時過濾陳舊欄位；排程定期 sweep 實際刪除

**不選「靠 `io.fetchSockets()` 查詢」**：adapter 確實能跨實例列出所有 socket，沒有殭屍問題。但每次查詢都是一次跨實例的請求-回應往返，而 M2 要對每則訊息判斷收件者是否在線、M3 的儀表板要高頻讀在線人數——把 O(1) 的 Redis 讀變成廣播往返，代價不成比例。

**但 `fetchSockets()` 有更好的用途**：當作**驗證基準**。整合測試中比對「Redis Hash 算出的在線集合」與「adapter 實際持有的 socket 集合」是否一致——這條測試是防止 presence 與現實漂移的唯一保險。

### D4：補三條守則，涵蓋 WS 層的系統性缺口

探索時發現現有守則對新的 WS 層**完全沒有涵蓋**，而且缺的方式很一致：規則都存在、都正確，只是掃描範圍寫死在 HTTP 那側。

| 守則 | 現況 | 缺口 |
| --- | --- | --- |
| `layering.spec.ts` | 只 filter `*Controller.ts` | `ChatGateway.ts` 直接注入 Prisma 不會被擋——**eden 的 544 行肥 gateway 在這裡可以原樣重演** |
| `dto-from-zod.spec.ts` | 只掃 `adapter/in/web` | WS payload 是外部輸入，不驗證就進 service |
| `authorization-coverage.spec.ts` | 只掃 `adapter/in/web` | `@SubscribeMessage` handler 漏掛認證不會被發現 |

這與 lessons 裡記的附件 IDOR 是同一個型態：**「檢查應存在而不存在」**——那次的 controller 通過了當時全部 18 支守則，因為沒有規則要求它有它缺的東西。

三條都補在本 change，且**要先於 gateway 實作**：守則先到位，寫的時候才會被擋。

### D5：能力前綴用 `platform-`，M2 的事件契約前綴留作未決

`openspec-spec-format.spec.ts` 只認 `api-` / `ui-` / `platform-` 三類，且 `api-*` **強制**每個需求寫出 HTTP 請求與回應 JSON。WS 事件沒有 HTTP status，硬套會寫出假的東西。

M1 是連線層的工程契約（認證時機、一致性保證、送達保證），`platform-` 名副其實。

**但 M2 會有真正的事件契約**（`sendMessage` 的 payload 形狀、ack 回應形狀、錯誤碼），那時 `platform-` 就不合適了。屆時要嘛新增 `ws-` 前綴並改守則，要嘛放寬 `api-*` 的格式要求以涵蓋非 HTTP 契約。**這個決定留給 M2**，M1 不預先動 conventions。

### D6：WS 不分 admin / front 側

既有的 `side-isolation.spec.ts` 以路徑含 `/admin/` 或 `/front/` 判定所屬側。WS 層放在 `adapter/in/ws/`（不分側），因此自然落在規則外——這是正確的：

- 聊天 WS 只服務終端使用者，沒有後台對應面
- M4 的後台儀表板走 SSE 不走 WS（既定決策）

所以 WS 是「第三個 in 側」，與 admin / front 平行而非其下。

### D7：CLI 測試客戶端是產品的一部分，不是拋棄式腳本

`scripts/ws-client.ts` 用 `socket.io-client` 實作，能：以指定帳號連線、加入群組、送/收事件、主動斷線、模擬網路中斷後重連。

**為什麼不是拋棄式**：M1 沒有 UI（前台是另一個 repo），這支腳本是唯一能手動驗證的入口；M2 的斷線補齊、M3 的監控埋點都要靠它製造情境。它會被反覆使用，所以照正式程式碼的標準寫。

## Risks / Trade-offs

- **[抽取 guard 邏輯動到全域認證]** `JwtAuthGuard` 是 `APP_GUARD`，改壞了所有已登入請求同時失效 → 抽取必須是純粹的搬移，**測試零修改通過**是驗收條件；要改測試就代表行為變了，退回重做

- **[兩實例整合測試在 CI 的穩定性]** 同時起兩個 NestJS 實例 + Redis，埠衝突、啟動競態、關閉不乾淨都可能造成間歇性失敗，而 todo 已記錄 e2e 有未解的間歇性失敗 → 兩實例測試獨立成一支 spec、序列執行、埠由環境變數指定而非寫死；失敗時保留完整 log 而非用 grep 過濾（這是 lessons 記過的教訓）

- **[心跳間隔的取捨無法先驗]** 太密集浪費 Redis 往返，太稀疏讓殭屍存活更久 → 先設 15 秒心跳 / 45 秒視為陳舊，寫成 env 可調，等 M3 有監控數據再校準

- **[Socket.IO 的協定開銷]** 每個訊息帶 engine.io 的封裝，且預設會先嘗試 HTTP long-polling 再升級到 WebSocket → 明確設定 `transports: ['websocket']` 跳過 polling 升級；開銷本身是選 Socket.IO 時就接受的代價

- **[`@socket.io/redis-adapter` 與 node-redis v5 的相容性]** 專案用的是 `redis` 套件（node-redis）而非 eden 的 `ioredis`，adapter 對兩者都支援但需要**兩條獨立連線**（pub 與 sub，因為 subscribe 中的連線不能發指令） → 實作時確認連線數與既有 `RedisService` 的關係，不要共用同一條

## Migration Plan

無資料遷移（M1 不落地任何資料）。

**需使用者手動執行**：`apps/api/.env` 補上新增的 WS 設定（心跳間隔、離線廣播延遲等），項目清單於實作完成後給出。

**回滾**：整個 change 在單一分支，WS 層是新增而非改寫，回滾只需 revert；唯一動到既有程式碼的是 D2 的 guard 抽取，該部分行為等價且有測試覆蓋。

## Open Questions

- **M2 的 WS 事件契約要用哪個能力前綴**：見 D5。`api-*` 的格式規定綁死 HTTP 語意，需要新增 `ws-` 前綴或放寬既有規則。M1 不預先決定，但 M2 開工前必須解決，否則事件契約會沒有地方可寫。
