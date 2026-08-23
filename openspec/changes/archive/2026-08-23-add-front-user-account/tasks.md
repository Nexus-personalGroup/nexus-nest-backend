> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；動到 module 接線加 `pnpm build`；
> 動到 swagger yaml 加 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 時間相關的測試用 `TZ=UTC` 再跑一次（已踩過）。
> 跑單一測試檔：`cd apps/api && pnpm jest <path>`（**不要 `--filter`**）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：
> 塊 1（schema）→ 塊 2（side claim，可獨立驗證）→ 塊 3（前台認證）。
> 塊 2 動的是既有的後台路徑，**它自己就要能全綠**——那是「純新增」的證明。
> 塊 4 的 swagger 涵蓋塊 3 的端點。
>
> **本 change 有 migration**（新增 `users` 表，不動 `members`）。
> **新增兩個 production 必填的環境變數。**
>
> **這個 change 刻意不切換任何既有路徑**：`/api/front/chat/*` 與 WS 仍吃 admin token。
> 切換是 change 4 的事——若實作中覺得「順手改一下」，那就是在做半套的 change 4。

## 1. Schema：`users` 表

- [x] 1.1 ⭐ 只加前台真正需要的欄位（見 design.md D1）：
      `email`(unique) / `password` / `displayName` / `avatarUrl`(null) /
      `emailVerifiedAt`(null) / `status` / `tokenVersion` / `lastSeenAt`(null) /
      `createdAt` / `updatedAt` / `deletedAt`。
      **不要複製 `members` 的 `roleId` / `lockedAt` / `isDefault` /
      `failedLoginCount` / `lastPasswordChange`**——它們會永遠是預設值，
      然後在某次 review 被誤讀成「有這個功能」
- [x] 1.2 `///` 註解寫清楚每個欄位的用途，特別是 `lastSeenAt` 與 presence 的差別
      （前者永久、後者在 Redis 且會消失）
- [x] 1.3 用 `migrate dev --create-only` 產生 migration，確認 SQL 只有 CREATE TABLE、
      **沒有動到 `members`**，再 `deploy`。
      **`///` 不會產生 `COMMENT ON`**，要的話手動補（已踩過兩次）。
      **`pnpm db:migrate --name X --create-only`，不要加 `--` 分隔符**（已踩過）
- [x] 1.4 seed：幾個測試用的前台帳號（沿用 `seeds/` 的既有形式與命名）
- [x] 1.5 驗證：`pnpm --filter @app/api db:generate && pnpm typecheck` 全綠

## 2. Token 側別（動既有的後台路徑，必須自己全綠）

- [x] 2.1 `JwtPayload` 加 `side?: 'admin' | 'front'`（optional——舊 token 沒有）
- [x] 2.2 `FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET` 加進 `envSchema`，
      **production 必填且至少 32 字元**（沿用既有兩個 secret 的 `productionErrors` 寫法）
- [x] 2.3 admin 的 `LoginService` / `RefreshTokenService` 簽發時帶 `side: 'admin'`
- [x] 2.4 ⭐ `ResolveMemberContextService` 拒絕 `side` 不為 `admin` 的 token。
      **缺少 `side` 視為 `admin`**，並在註解寫明這是**有時效的相容措施**——
      部署超過 refresh token 效期後可改為拒絕。沒有這句話它會變成永久的後門
- [x] 2.5 單元測試：`side: 'admin'` 通過、`side: 'front'` 拒絕、**缺少 `side` 通過**
- [x] 2.6 e2e：後台登入簽出的 token 帶 `side: 'admin'`（解 token 檢查）
- [x] 2.7 ⭐ 驗證：`pnpm --filter @app/api test:e2e` **全綠**——
      這一塊動的是既有路徑，任何一支既有測試變紅都代表切到了不該切的東西

## 3. 前台認證

- [x] 3.1 ~~用 `gen:module --front` 產生骨架~~ **產生器的形狀不合，已還原。**
      它產的是 CRUD 模組（list / create / update / delete + 一張表的 model），
      而 auth 沒有那些端點。把 24 個 CRUD 檔改造成 4 支認證端點，
      比照著 `admin/auth.module` 手寫更費工。**產生器適用於資源型模組，不適用於認證**
- [x] 3.2 ⭐ `UserContext` 是**平行型別**，不是 `MemberContext` 的子集或繼承
      （見 design.md D4）：前台沒有角色也沒有權限碼，硬塞空陣列會讓
      「permissions 是空的」同時代表兩件事。解析 token 的 use case 同樣是平行的兩支
- [x] 3.3 登入：帳號不存在時**仍跑一次 bcrypt**，dummy hash 的 cost 綁 `BCRYPT_ROUNDS`
      （抄 admin `LoginService` 的既有做法，**先讀再寫**）
- [x] 3.4 ⭐ **不實作帳號鎖定**。前台的暴力破解防護交給全域 throttle 與
      `APPLICATION_IP_BLOCK_THRESHOLD`——per-account 的鎖定剛在
      `fix-unauthenticated-surface` 被證明是未認證者可觸發的 DoS 面
- [x] 3.5 refresh：rotation + 比對 `tokenVersion` + 檢查 `type` 與 `side`
- [x] 3.6 登出：**沿用既有的 token 黑名單**，不要開第二套——
      它以 token 為鍵，與哪一側簽的無關
- [x] 3.7 `GET /api/front/me`：回應 **MUST NOT** 含 `password` / `tokenVersion` /
      任何後台概念。用 `Object.keys().sort()` 在 e2e 釘住（`objectContaining` 抓不到多回的欄位）
- [x] 3.8 登入成功更新 `lastSeenAt`
- [x] 3.9 單元測試：登入成功 / 帳號不存在與密碼錯不可區分 / 停權 → 403 /
      refresh 的四種拒絕（型別、側別、版本、停權）
- [x] 3.10 驗證：`cd apps/api && pnpm test` 全綠

## 4. Swagger 與 api-client

- [x] 4.1 前台的四支端點寫進 `docs/swagger/front/`，註冊進該側的 `openapi.yaml`。
      **不要用 `allOf`**（已踩過）
- [x] 4.2 `swagger:bundle` + `api-client generate`。
      **api-client 是 admin-only**，前台端點不會進 `schema.ts`——那是正常的
- [x] 4.3 驗證：`swagger:check` exit 0、`pnpm typecheck` 全綠、`test:arch` 全綠。
      **實作中補了一條守則**：`swagger-sync` 的路由掃描以「檔案裡的第一個
      `@Controller`」當前綴，我一度把 `FrontMeController` 與 `FrontAuthController`
      放在同一檔，於是 `/api/front/me` 被算成 `/api/front/auth`——
      規則照樣報錯，但報的是一條不存在的路由，真正缺的那條完全沒被提到。
      **一個看起來正常的錯誤答案。** 拆檔案之外，加了
      「一個檔案只能有一個 `@Controller`」的守則從根源消掉這個盲點

## 5. e2e 驗收

- [x] 5.1 e2e：前台登入 → refresh → 用新 token 打 `/me` → 登出 → 舊 token 失效
- [x] 5.2 ⭐ e2e：**用 admin token 打 `/api/front/me` → 401**
      （secret 不同，簽章就驗不過）
- [x] 5.3 ⭐ e2e：**用前台 token 打 `/api/admin/members` → 401**
- [x] 5.4 e2e：前台 refresh 端點收到 admin 的 refresh token → 401
- [x] 5.5 e2e：`/me` 的欄位鍵完全等於預期集合
- [x] 5.6 e2e：連續密碼錯誤**不會**鎖定帳號（第 N+1 次仍是 401 而非 423）
- [x] 5.7 ⭐ **反向驗證的預期是錯的，實測結果更有價值。**
      把側別檢查拿掉、**再把前台 secret 設成與後台相同**，e2e **仍然全綠**——
      因為前後台之間有**三道獨立的防線**，任何一道單獨都擋得住：
      (1) 各自的簽發 secret；(2) `side` 比對；
      (3) **兩張表的 ID 空間不相交**——前台使用者的 id 在 `members` 裡查不到。
      第三道是分表的附帶效果，寫 spec 時沒算到它。

      所以 5.2 / 5.3 驗的是**結果**（必須拒絕），驗不了**機制**。
      機制改用 `ResolveMemberContextService.spec.ts` 的單元測試釘：
      `side: 'front'` → 拒絕、缺少 `side` → 通過。**反向驗證在那一層才紅**（已確認）
- [x] 5.8 驗證：`pnpm --filter @app/api test:e2e` exit 0

## 6. 收尾

- [x] 6.1 跑完整驗證鏈並貼出實際輸出（**exit code**），
      含 `test:e2e`、`test:integration`、`build`
- [x] 6.2 `smoke-test.md`：**含一項只有人工驗得到的**——
      用前台 token 打後台的 Swagger 上任一端點，確認拿到 401 而不是任何資料
- [x] 6.3 `.env.example` 與 `docker/api.container.env` 的兩個新 secret（給使用者貼）。
      **env 三方同步守則會擋**，所以這步漏掉會直接紅
- [x] 6.4 `openspec/project.md` 與 `project/backend-runtime.md`：
      補上兩側的帳號體系與 token 作用域
- [x] 6.5 更新 `tasks/todo.md`：路線圖第 3a 項打勾，並寫明
      **觀察 A 只補了一半**（前台端點仍接受 admin token，另一半在 change 4）
- [x] 6.6 新踩到的坑寫進 `tasks/lessons.md`：反向驗證沒紅的第三種原因
      （有沒算到的防線）、以及兩個 Guard 都檢查 `@Public()` 等於沒有 Guard
- [x] 6.7 `openspec archive add-front-user-account`
