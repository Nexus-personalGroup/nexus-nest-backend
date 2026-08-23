> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；
> 動到 WS 加 `pnpm --filter @app/api test:integration`（真實 Redis，**不可 mock**）；
> 動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `swagger:bundle` + `api-client generate`
> （⭐ 改完 swagger **一定要跑 `pnpm --filter @app/web typecheck`**——
> 共用 schema 的引用錯誤只有那裡抓得到）。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
>
> **塊的依賴**：
> 塊 1（schema + env + port）必須先做，後面每一塊都用得到。
> 塊 2（驗證門檻）與塊 3（註冊與驗證信）互相獨立，但**塊 2 一做完既有的聊天測試就會紅**
> （seed 使用者沒驗證），所以塊 2 必須連同 seed 與測試 helper 的調整一起做完。
> 塊 4（密碼重設）獨立於 2、3。
>
> **這個 change 的每一支端點都是未認證可達的**——它是整個系統對外最寬的面。
> 「不洩漏帳號是否存在」的斷言不是加分項，是主要的驗收內容。

## 1. Schema、環境變數與 port

- [x] 1.1 `schema.prisma` 新增 `UserTokenPurpose` enum（`VERIFY_EMAIL` / `RESET_PASSWORD`）
      與 `UserTokenRecord`（`user_tokens`）：`userId` / `token`（**sha256 雜湊，unique**）/
      `purpose` / `expiresAt` / `usedAt` / `createdAt`。
      索引：`[userId, purpose]`（作廢同 purpose 用）與 `[expiresAt]`（清理用）
- [x] 1.2 ⭐ `pnpm --filter @app/api db:migrate --name add_user_tokens`
      （**不要加 `--` 分隔符**）。確認 SQL 只有 CREATE TYPE + CREATE TABLE + CREATE INDEX
- [x] 1.3 `envSchema` 新增四個：`APP_FRONT_URL`、`APP_FRONT_VERIFY_REDIRECT_PATH`
      （預設 `/verify-email`）、`EMAIL_VERIFICATION_EXPIRES_IN`（預設 24h）、
      `FRONT_PASSWORD_RESET_EXPIRES_IN`（預設 1h）。
      ⭐ `APP_FRONT_URL` 要進 `productionErrors`——沒有它，驗證信的連結會指向 `undefined`
- [x] 1.4 ⭐ **env 檔走無點暫存檔**：分兩批給使用者複製（第一批四個、
      第二批兩個限流變數）。**這批沒有金鑰**，但暫存檔仍要刪
- [x] 1.4b **計畫外**：新增 `EMAIL_SEND_RATE_LIMIT` / `EMAIL_SEND_RATE_WINDOW_SEC`
      與 `EmailSendRateLimitPort`——D5 只寫了「要做信箱節流」，沒說它需要自己的
      port 與環境變數（既有的 throttler 是 per-IP 的 HTTP 中介層，接不上）
- [x] 1.5 新增 `UserTokenPort`（out）：`issue(userId, purpose, ttl)` 回明文 token、
      `consume(token, purpose)` 回 `userId | null`（同時標記 usedAt 並作廢同 purpose 的其他 token）、
      `invalidateAll(userId, purpose)`。
      ⭐ **`consume` 一定要吃 `purpose`**——少了它就能拿驗證信的 token 去改密碼
- [x] 1.6 `SaveUserPort` 增加 `markEmailVerified(id)` 與 `updatePassword(id, hash)`
      （後者 MUST 同時遞增 `tokenVersion`）
- [x] 1.7 `LoadUserPort` 增加 `existsByEmail(email)`；`PrismaUserRepository` 實作全部
- [x] 1.8 驗證：`cd apps/api && pnpm test` 全綠

## 2. 驗證門檻（未驗證不能聊天）

> ⚠️ 這一塊一動，**所有聊天相關的 e2e 與整合測試都會紅**（seed 的使用者沒驗證）。
> 2.5 與 2.6 必須在同一塊做完，不可分開提交。

- [x] 2.1 `UserContext` 增加 `emailVerified: boolean`；`ResolveUserContextService`
      由 `emailVerifiedAt != null` 推導。⭐ **不要快取在 token 裡**——
      驗證完之後使用者不該被迫重新登入
- [x] 2.2 新增 `EMAIL_NOT_VERIFIED` 錯誤碼（`response-codes.ts` + `response-messages.ts`
      兩個檔都要）與對應的 domain exception（kind 對到 403）
- [x] 2.3 新增 `EmailVerifiedGuard`，掛在三支 chat controller 上（`FrontJwtAuthGuard` 之後）
- [x] 2.4 ⭐ `ChatGateway.handleConnection` 加一道檢查，走**既有的拒絕路徑**斷線。
      只擋 HTTP 不擋 WS 的話，未驗證的帳號雖然開不了房間，卻能連上去**收別人的廣播**
- [x] 2.5 ⭐ 新守則：`web/front/` 下掛了 `FrontJwtAuthGuard` 的 controller
      必須也掛 `EmailVerifiedGuard`，豁免需明列（目前只有 `FrontMeController`）。
      合成輸入測試：兩者都掛 → 通過；只掛前者且不在豁免清單 → 抓出
- [x] 2.6 ⭐ seed 與測試 helper 一起改：`seed-test-users` 補 `emailVerifiedAt`
      並改成 `alwaysRun`（不改的話既有資料庫跳過它，補不到——這是
      `add-admin-front-user-management` 踩過的洞）；另加一個刻意未驗證的
      `unverified@test.com`。`test/helpers/db.ts` 的 `seedUser` **預設已驗證**，
      要驗未驗證情境時明確傳 `verified: false`
- [x] 2.7 `/front/me` 回應加 `emailVerified`；登入回應同理
- [x] 2.8 驗證：`pnpm test`、`test:e2e`、`test:integration` 三者皆 exit 0

## 3. 註冊、信箱驗證與重發

- [x] 3.1 `RegisterService`：正規化 email（小寫去空白）→ 查重 → bcrypt → 建立
      （`emailVerifiedAt` 為 null）→ 發 token → 寄信。
      ⭐ **寄信不 await**，失敗只記 log，不讓註冊失敗
- [x] 3.2 ⭐ 已註冊但未驗證的信箱再次註冊：回 `409` 並**重發驗證信到原信箱**，
      MUST NOT 覆蓋既有帳號的密碼或 displayName。
      這是最常見的真實情境（信進了垃圾信匣），擋掉他等於逼他換信箱
- [x] 3.3 `VerifyEmailService` + `GET /verify-email`：驗完 `302` 導回
      `${APP_FRONT_URL}${APP_FRONT_VERIFY_REDIRECT_PATH}?result=success|invalid|expired`。
      ⭐ **成功要冪等**：已驗證的帳號再次帶同一個 token 進來仍導向 `success`——
      預抓與郵件安全掃描會提前把 token 用掉，這時對使用者顯示失敗是錯的
- [x] 3.4 ⭐ 本端點 MUST NOT 回 JSON 錯誤：使用者是從信件點進來的，
      看到一段 JSON 只會不知道發生什麼事。失敗一樣是 302，只是 `result` 不同
- [x] 3.5 `ResendVerificationService`：⭐ **無論信箱是否存在、是否已驗證一律 204**。
      這一支與註冊不同——它若依帳號狀態回不同的東西，就是一個乾淨的帳號探測點
- [x] 3.6 節流：`register` / `resend-verification` 兩支都套 IP + **信箱**節流。
      ⭐ 信箱節流的鍵用**正規化後的 email**，否則 `Foo@x.com` 與 `foo@x.com`
      會拿到兩份獨立額度。命中回 `429`（不套「一律 204」——節流與帳號是否存在無關）
- [x] 3.7 DTO 由 zod 推導；controller 掛 `@Public()`，**不掛** `FrontJwtAuthGuard`
- [x] 3.8 單元測試：purpose 不符 → 失敗；重發會作廢舊 token；大小寫視為同一信箱
- [x] 3.9 Swagger yaml + bundle + generate + ⭐ `pnpm --filter @app/web typecheck`

## 4. 密碼重設

- [x] 4.1 `FrontForgotPasswordService`：一律 204，判準沿用後台既有的
      `ForgotPasswordService`（**不改後台那一支任何一行**）
- [x] 4.2 ⭐ 未驗證的帳號**也可以**重設密碼：忘記密碼與信箱驗證是兩件事，
      而重設信本身就會送到那個信箱——能收到就證明他擁有它
- [x] 4.3 `FrontResetPasswordService`：驗 token（帶 purpose）→ 密碼政策 →
      寫入雜湊 → ⭐ **遞增 `tokenVersion`**（會忘記密碼的情境本來就包含
      「帳號可能被別人用著」）→ 標記 usedAt → 作廢其他同 purpose token
- [x] 4.4 ⭐ 無效／過期／已用／purpose 不符**一律回同一個錯誤**，不可區分
- [x] 4.5 單元測試：舊密碼失效、舊 access token 失效、token 不可重複使用
- [x] 4.6 Swagger + bundle + generate + web typecheck

## 5. E2E 與整合測試

- [x] 5.1 ⭐ **帳號列舉**：`resend-verification` 與 `forgot-password` 對
      「存在」與「不存在」的信箱，回應的**狀態碼與 body 必須完全相同**
- [x] 5.2 ⭐ 註冊的完整流程：註冊 → 取出 DB 裡的 token → 打 verify → 302 且
      `result=success` → 該帳號可以聊天
- [x] 5.3 ⭐ 未驗證的帳號：登入成功、`/front/me` 200、
      三支 chat 端點各回 `403 EMAIL_NOT_VERIFIED`
- [x] 5.4 ⭐ 驗證後**同一個 token** 立刻可以聊天（不必重新登入）
- [x] 5.5 ⭐ purpose 交叉：拿 `RESET_PASSWORD` 的 token 打 verify-email → `invalid`；
      拿 `VERIFY_EMAIL` 的 token 打 reset-password → `400`
- [x] 5.6 重設密碼：新密碼可登入、舊密碼失敗、**舊 access token 401**
- [x] 5.7 節流：同一信箱重複重發 → `429`；大小寫不同共用額度
- [x] 5.8 ⭐ 整合測試：未驗證帳號建立 WS 連線 → 被拒且**沒有 presence 紀錄**；
      驗證後同一個 token 連得上
- [x] 5.9 ⭐ **反向驗證**：
      (a) 拿掉 `EmailVerifiedGuard` → 5.3 要紅；
      (b) `consume` 拿掉 `purpose` 條件 → 5.5 要紅；
      (c) `resend-verification` 改成信箱不存在時回 404 → 5.1 要紅；
      (d) 拿掉 WS 的驗證檢查 → 5.8 要紅。四者還原後都要綠
- [x] 5.10 驗證：`TZ=UTC test:e2e` 384 passed / exit 0、`test:integration` 58 passed / exit 0
- [x] 5.11 ⭐ **計畫外，且是這一塊最重要的發現**：`TransformInterceptor` 會把
      `@Redirect()` 的回傳值包成 `{ success, data }`，於是 Nest 讀不到 `url`——
      **狀態碼是對的 302，但 `Location` header 是空的**，瀏覽器停在空白頁且沒有錯誤。
      `@Render()` 早就因為同樣的理由被豁免了，`@Redirect()` 只是沒人用過。
      已加豁免與對應的單元測試
- [x] 5.12 ⭐ **測試抓到一個被我自己蓋掉的實作**：WS 的 `emailVerified` 檢查
      在塊 2 就寫過，但那次的 python 腳本寫了兩次檔，第二次用的是**還沒套用
      第一次替換的字串**，把檢查整段蓋掉。typecheck 與 lint 都不會發現，
      只有 5.8 那支整合測試會紅

## 6. 收尾

- [x] 6.1 完整驗證鏈全部 exit 0：`typecheck` / `lint` / `test:cov`（api 636+192、web 111）/
      `build` / `test:e2e` 384（`TZ=UTC`）/ `test:integration` 58 / `swagger:check` / web `typecheck`
- [x] 6.2 `smoke-test.md`：⭐ 含**只有人工驗得到的**——真的收一封信、
      點信裡的連結、確認導回前台且 `result=success`
- [x] 6.3 `openspec/project.md` 與 `project/backend-runtime.md`：
      補上前台的完整認證流程與「未驗證不能聊天」這道門檻
- [x] 6.4 更新 `tasks/todo.md`：3b 打勾；**前台專案那節補上註冊／驗證／重設的接法**
- [x] 6.5 新踩到的坑寫進 `tasks/lessons.md`（兩條）
- [x] 6.6 ⭐ `openspec archive add-front-user-registration`，
      並**檢查 `api-front-auth` 的 `## Purpose`**——它目前是 archive 留下的
      `TBD` 佔位字串，這個 change 正好順手補掉一份
- [x] 6.7 ⭐ **需要使用者手動執行**：複製 env 暫存檔後刪掉、
      部署時跑 `db:migrate:deploy` 與 `db:seed`
