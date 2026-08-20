> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 塊 2 與塊 3 額外需 `pnpm --filter @app/api test:e2e`（動到全域 guard 與新的進入點）。
> 塊 5、6 額外需兩實例整合測試。動到 module 接線的塊要加 `pnpm build`。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1 是所有後續的前提（依賴與 Redis 原語）。
> 塊 2 **必須在塊 3 之前**——WS 認證要呼叫塊 2 抽出的 service，順序反過來就會先寫一份重複邏輯。
> 塊 3 是原子塊：守則與骨架互為前提（守則需要有東西可掃、骨架需要守則在寫的時候就擋）。
> 塊 4、5 互相獨立，可任意順序。
> 塊 6 是本 change 的**唯一真正驗收**，相依塊 3–5 全部完成。

## 1. 依賴與 Redis 基礎設施

- [x] 1.1 `apps/api/package.json` 加入 `@nestjs/websockets`、`@nestjs/platform-socket.io`、`socket.io`、`@socket.io/redis-adapter`；dev 加 `socket.io-client`。確認版本與 NestJS 11 相容
- [x] 1.2 `RedisService` 補上 presence 需要的 Hash 原語（`hset` / `hgetall` / `hdel` / `expire`）。**沿用既有的 fail-closed 立場**：Redis 不可用時拋錯而非靜默降級
- [x] 1.3 `@socket.io/redis-adapter` 需要 **pub 與 sub 兩條獨立連線**（subscribe 中的連線不能再發指令），確認它們與既有 `RedisService` 的單一連線如何共存——**不可共用**
- [x] 1.4 `infrastructure/redis/cache-keys.ts` 加入 presence 的 key 組合函式，沿用既有的集中管理慣例
- [x] 1.5 新增 env 到 `envSchema`：心跳間隔、陳舊判定倍數、離線廣播延遲、單一成員連線數上限。**漏加會在執行期靜默為 undefined**（`env-schema.spec.ts` 會擋）
- [x] 1.6 驗證：`pnpm install` → `pnpm typecheck && pnpm lint && pnpm test` 全綠

## 2. 抽出共用的 token 解析（動到全域 guard，最高風險）

- [x] 2.1 新增 `application/port/in/shared/ResolveMemberContextUseCase`，定義 `resolve(token) → MemberContext`
- [x] 2.2 新增 `application/service/shared/ResolveMemberContextService`：把 `JwtAuthGuard.canActivate` 中的黑名單檢查、JWT 驗證、`type === 'access'`、MemberContext 快取（含損毀 fallback）、status 檢查、`tokenVersion` 比對整段搬過來
- [x] 2.3 `checkPasswordExpiry` **留在 HTTP guard 不搬**：它拋 `PasswordChangeRequiredException` 引導使用者去改密碼頁，WS 沒有對應處置流程
- [x] 2.4 `JwtAuthGuard` 改為呼叫該 service，只保留：`@Public()` 判定、`/api/metrics` 略過、從 header 取 token、密碼到期檢查、把 context 掛到 request
- [x] 2.5 為 `ResolveMemberContextService` 寫單元測試（port 全 mock），涵蓋六條判定路徑各自的成功與失敗
- [x] 2.6 **驗收條件：`JwtAuthGuard.spec.ts` 與全部 e2e 零修改通過。** 需要改測試就代表行為變了——退回重做，不要改測試遷就實作
- [x] 2.7 **反向驗證**：拿掉 service 裡的 `tokenVersion` 比對，確認對應測試變紅（這正是舊專案漏掉的那條）；改回並確認 `git diff` 乾淨
- [x] 2.8 驗證：`pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e` 全綠，貼出實際輸出

## 3. WS 骨架與三條守則（原子塊，不可再拆）

> 守則與骨架互為前提：守則要有東西可掃，骨架要在寫的時候就被擋。
> 拆開的話會出現「gateway 已經寫好、守則才補上」——而那時違規已經在了。

- [x] 3.1 `adapter/in/ws/`：`ChatGateway`（`/chat` namespace，`transports: ['websocket']` 跳過 polling 升級）、連線認證（呼叫塊 2 的 service）、`WsExceptionFilter` 統一錯誤形狀
- [x] 3.2 `adapter/in/ws/schemas/`：payload 的 Zod schema，型別一律 `z.infer`
- [x] 3.3 `adapter/in/ws/events.ts`：事件名稱與 payload 型別的單一真相來源，**不在 `emit()` 用裸字串**
- [x] 3.4 擴充 `layering.spec.ts`：掃描範圍從 `*Controller.ts` 擴到同時涵蓋 `*Gateway.ts`，並保留「掃描範圍有效」的自我檢查
- [x] 3.5 擴充 `dto-from-zod.spec.ts`：掃描範圍加入 `adapter/in/ws`
- [x] 3.6 擴充 `authorization-coverage.spec.ts`：涵蓋 `@SubscribeMessage` handler；豁免項目必須註明理由
- [x] 3.7 **反向驗證（三條各驗一次）**：(a) 在 gateway 注入 Prisma → layering 變紅；(b) 手寫一個 payload interface → dto-from-zod 變紅；(c) 加一個未標註認證的 handler → authorization-coverage 變紅。三者逐一改回並確認 `git diff` 乾淨
- [x] 3.8 驗證：`pnpm test`（含 `test:arch`）全綠，貼出守則數量變化

## 4. Presence（Redis Hash + 心跳）

- [x] 4.1 `application/port/out/PresencePort`：`markOnline` / `markOffline` / `heartbeat` / `isOnline` / `getOnlineMembers` / `getConnectionCount`
- [x] 4.2 `adapter/out/redis/RedisPresenceAdapter`：Hash 結構 `presence:member:{memberId}`，field = `{instanceId}:{socketId}`，value = 最後心跳的 epoch ms
- [x] 4.3 讀取時過濾超過 `心跳間隔 × 陳舊倍數` 的欄位；排程定期 sweep 實際刪除陳舊欄位
- [x] 4.4 心跳：更新自己的 field **並續期整個 key 的 TTL**——只更新 field 不續期，key 會在成員長時間在線時過期
- [x] 4.5 `instanceId` 的產生方式：行程啟動時產生一次，**不可用 hostname**（同一主機多實例會撞名）
- [x] 4.6 單元測試：多裝置（一個成員兩條連線，斷一條仍在線）、陳舊過濾、sweep
- [x] 4.7 **反向驗證**：把陳舊過濾拿掉，確認「實例死亡」情境的測試變紅
- [x] 4.8 驗證：`pnpm typecheck && pnpm lint && pnpm test` 全綠

## 5. 跨實例廣播

- [x] 5.1 `application/port/out/EventPublisherPort`：對群組與對特定成員發送事件的抽象
- [x] 5.2 `adapter/out/socketio/SocketIoEventPublisher`：實作該 port
- [x] 5.3 掛上 `@socket.io/redis-adapter`（用 1.3 建立的 pub / sub 兩條連線）
- [x] 5.4 單元測試：service 層對 `EventPublisherPort` 的呼叫（port mock）
- [x] 5.5 驗證：`pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全綠

## 6. CLI 測試客戶端與兩實例整合測試（本 change 的驗收）

- [x] 6.1 `scripts/ws-client.ts`：以指定帳號連線、加入群組、送收事件、主動斷線、模擬中斷後重連。照正式程式碼標準寫——M1 沒有 UI，這是唯一的手動驗證入口，且 M2 / M3 會反覆使用
- [x] 6.2 ⭐ **兩實例整合測試**：起兩個 API 實例（埠由環境變數指定，不寫死）+ 共用 Redis，客戶端分別連上，驗證 A 實例送出的群組事件 B 實例的連線收得到。**這是 M1 的唯一真正驗收**
- [x] 6.3 presence 一致性測試：比對「Redis Hash 算出的在線集合」與 `io.fetchSockets()` 實際持有的 socket 集合——這是防止 presence 與現實漂移的唯一保險
- [x] 6.4 實例死亡情境：強制終止其中一個實例（不走正常關閉），確認其上的連線在數個心跳週期內從 presence 消失
- [x] 6.5 整合測試獨立成一支 spec、**序列執行**、失敗時**保留完整 log 不用 grep 過濾**（`tasks/lessons.md` 記錄過：前兩次 e2e 間歇失敗都因為用管線過濾而查不下去）
- [x] 6.6 驗證：兩實例測試通過，貼出實際輸出

## 7. 文件與規格同步

- [x] 7.1 `openspec/project.md`：技術棧表加入 WebSocket 列；「目的」的即時通訊層從「規劃中」改為已實作的範圍
- [x] 7.2 `openspec/project/backend-architecture.md`：`adapter/in/ws` 的定位與 `adapter/in/web` 的關係、為何不分 admin / front 側
- [x] 7.3 `openspec/project/testing.md`：新增的三條守則、兩實例整合測試的執行方式
- [x] 7.4 `README.md`：WS 開發與 `scripts/ws-client.ts` 的用法
- [x] 7.5 驗證：`pnpm test` 全綠（`project-docs.spec.ts` 會檢查文件連結完整性）

## 8. 收尾

- [x] 8.1 跑完整驗證鏈並貼出實際輸出（含兩實例測試）
- [x] 8.2 更新 `tasks/todo.md`：M1 完成、M2 開始；新踩到的坑寫進 `tasks/lessons.md`
- [x] 8.3 ~~決定 M2 的事件契約前綴~~ —— **刻意不在本 change 決定**：它會改動 `openspec-spec-format.spec.ts` 的前綴白名單，屬於 conventions 變更，不該夾帶在功能 change 裡。已轉列 `tasks/todo.md` 的「需決定（M2 開工前）」，並在 design.md 的 Open Questions 留下兩個選項與取捨
- [x] 8.4 **需使用者手動執行**：`apps/api/.env` 補上 1.5 新增的 WS 設定（AI 對該檔無寫入權限）
- [x] 8.5 `openspec archive add-websocket-foundation` 封存。**注意**：本 change 新增能力 `platform-websocket-transport`，封存時會建立新的 master spec，記得補 Purpose 段落不要留 TBD
