> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 塊 2（節流）動到 controller，要加 `TZ=UTC pnpm --filter @app/api test:e2e`；
> 塊 4 動到 module 接線，要加 `pnpm build`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠，
> 還原後 `git diff` 要乾淨。
> 本機跑 e2e 前先 `pnpm docker:deps`。
>
> **塊的依賴**：**四塊互相獨立**，可任意順序。
> 塊 1 的 1.1（`API_BASE_URL` 給預設值）是 1.2 的前置——
> 它現在是 `optional()`，型別 `string | undefined`，**不先給預設值 `.replace()` 不過 typecheck**。
>
> **每塊綠燈後給一次 commit 指令，由使用者手動執行**，再進下一塊。
>
> **這個 change 沒有 schema 變動、沒有 migration。有一個環境變數從選填變 production 必填（塊 1）。**

## 1. 驗證信連結 + 併發註冊

- [x] 1.1 ⭐ **前置**：`validate-env.ts` 的 `API_BASE_URL` 從 `z.string().optional()`
      改成有預設值（`http://localhost:3000`），並列入 `productionErrors`。
      **順序不能顛倒**——先改用法會不過 typecheck
- [x] 1.2 ⭐ `VerificationMailService` 的連結 base 從 `APP_FRONT_URL` 改成 `API_BASE_URL`。
      註解要寫清楚**兩個變數是兩個角色**：`API_BASE_URL` 是後端自己的對外位址
      （信裡的連結由後端接），`APP_FRONT_URL` 是前台網站根位址（302 的導回目標）
- [x] 1.3 ⭐ **不要動 `FrontAuthController` 的 302 導回**——那一處用 `APP_FRONT_URL`
      是**對的**。改錯邊會把一個好的地方弄壞
- [x] 1.4 ⭐ 單元測試：**直接斷言連結字串**。這是整個測試矩陣缺的形狀——
      打端點的測試跑的是被測 app 自己的 base URL，而錯的正是 base 本身。
      要驗：以 `API_BASE_URL` 開頭、**不以 `APP_FRONT_URL` 開頭**、
      兩者設不同值時各用各的、base 結尾有斜線時不出現連續兩個斜線
- [x] 1.5 `PrismaUserRepository.create()` catch P2002 轉 `EmailAlreadyExistsException`
      （`ResponseCodes.EMAIL_ALREADY_EXISTS` 已存在）。照抄
      `PrismaMemberRepository` 的既有寫法
- [x] 1.6 ⭐ 註解要寫清楚**「先查」的角色變了**（design D5）：它不再是「防止衝突」
      （那是唯一索引的工作），而是「給出更好的訊息 + 未驗證時順便重發驗證信」。
      少了這句，下一個人會以為先查多餘而刪掉它，那會讓重發那條路徑消失
- [x] 1.7 單元測試：`create()` 撞 P2002 → 拋 `EmailAlreadyExistsException`（不是原始 Prisma 例外）
- [x] 1.8 `.env.example` 補上 `API_BASE_URL`
- [x] 1.9 ⭐ 反向驗證：連結改回 `APP_FRONT_URL` → 1.4 要紅；
      拿掉 P2002 的 catch → 1.7 要紅。還原後都要綠
- [x] 1.10 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0

## 2. 端點層節流

- [x] 2.1 ⭐ `FrontAuthController` **八支端點全部**加 `@Throttle`
      （login / refresh / logout / register / verify-email / resend-verification /
      forgot-password / reset-password）：登入 5、寄信類與 reset-password 3、
      其餘 10，皆 `ttl: 60_000`。**不判斷「哪幾支需要」**（design D3）——
      那是一個會被答錯的判斷，而答錯不會有徵兆
- [x] 2.2 ⭐ **額度必須明顯小於全域預設**（`COMMON_RATE_LIMIT_MAX_REQUESTS`，預設 100）——
      等於或大於全域等於沒有設
- [x] 2.3 e2e：登入超過額度回 `429`；註冊超過額度回 `429` 且沒有建立帳號、沒有寄信。
      **實作時發現兩個測試設計問題，都是反向驗證抓出來的**：
      (a) 既有的「mock 成極大值」寫法驗不到額度是多少（改成 200 照樣紅不了），
      改用**介於端點額度與全域額度之間**的計數（50），並加一條打後台登入的**對照組**
      ——沒有對照組就分不出擋下來的是哪一層；
      (b) 寄信限流與端點節流**共用同一支 `throttleIncrement`**，
      計數一起衝高會讓三支寄信端點的 429 來自寄信限流，
      拿掉 `@Throttle` 也會綠。改成依 key 分流（`email-rate:` 回 1）
- [x] 2.4 ⭐ 反向驗證：拿掉登入的 `@Throttle` → 2.3 要紅；
      把額度改成 200（大於全域）→ 2.3 要紅。還原後綠
- [x] 2.5 驗證：`pnpm typecheck && pnpm lint && pnpm test` 與
      `TZ=UTC pnpm --filter @app/api test:e2e` 皆 exit 0

## 3. 重設密碼標記已驗證

- [x] 3.1 ⭐ `FrontResetPasswordService` 成功時一併呼叫 `markEmailVerified`。
      它已是條件式更新（`where` 帶 `emailVerifiedAt: null`），重複呼叫安全
- [x] 3.2 ⭐ 註解寫下判準（design D6）：**憑證的強度與驗證信相同**——
      同一個信箱、同一組 sha256 一次性 token、同一套作廢邏輯。
      「能收到就證明他擁有它」這句話本來就寫在 `FrontForgotPasswordService` 裡
- [x] 3.3 單元測試：未驗證的帳號重設後 `emailVerifiedAt` 不再是 null；
      **已驗證的帳號重設後原本的驗證時間不被覆寫**
- [x] 3.4 ⭐ 反向驗證：拿掉 `markEmailVerified` 的呼叫 → 3.3 第一條要紅；
      把條件式更新改成無條件寫入 → 3.3 第二條要紅。還原後綠
- [x] 3.5 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0

## 4. IP 失敗計數接上前台登入

- [x] 4.1 `FrontLoginService` 注入 `IpBlockPort`，登入失敗遞增該 IP 的失敗計數，
      達 `APPLICATION_IP_BLOCK_THRESHOLD` 自動加入黑名單。
      照 `LoginService.ts:241` 的既有寫法
- [x] 4.2 登入成功時重置該 IP 的失敗計數
- [x] 4.3 ⭐ **改掉那段註解**——它現在描述了一條不存在的防線。
      這比缺口本身更值得修：**它會讓下一個讀的人以為事情已經做完了**，
      於是那個缺口永遠不會被補
- [x] 4.4 ⭐ 註解要記下：`buildFailedIpKey` 以 IP 為鍵**不分側**，
      因此後台與前台的失敗會累加。**這是對的**——同一個 IP 在兩側輪流試密碼
      仍然是同一個攻擊者。不寫的話下一個人會以為是 bug
- [x] 4.5 ⭐ **不改任何模組的歸屬**（design Non-Goals）。
      **實際上連接線都不用加**——`SecurityModule` 是 `@Global()`，
      `IP_BLOCK_PORT` / `IP_LIST_PORT` 本來就全域可用。
      `RevokeMemberSessionsService` 的搬家留在 todo，不併進來
- [x] 4.6 單元測試：登入失敗遞增計數、達門檻加入黑名單、登入成功重置計數
- [x] 4.7 ⭐ 反向驗證：拿掉遞增 → 4.6 第一條要紅；
      **只注入不呼叫** → 4.6 要紅（重構時最容易留下的殘骸）。還原後綠
- [x] 4.8 驗證：`pnpm typecheck && pnpm lint && pnpm test` 與 `pnpm build` 皆 exit 0

## 5. 收尾

- [x] 5.1 跑完整驗證鏈並**貼出實際 exit code**（含 `pnpm test:cov` 與完整 e2e）
- [x] 5.2 `smoke-test.md`：⭐ 含**只有人工驗得到的**——實際寄一封驗證信出來，
      **把信裡那個連結複製出來看**，確認它是 `http://localhost:3000/...` 而不是 5174。
      這正是 687 個測試漏掉的那一步，而 3b 的 smoke-test 寫了卻沒被執行
- [x] 5.3 ⭐ `openspec/project/testing.md` 補一段「送到系統外面去的字串」
      這個測試缺口的形狀（design D2）：信件連結、302 導回目標、webhook URL、
      推播 deep link 的共同特徵是**在系統內部永遠不會被呼叫**，
      任何「呼叫自己」的測試都驗不到，只有直接斷言字串本身才行
- [x] 5.4 更新 `tasks/todo.md`：把這個 change 加進路線圖並標狀態；
      審查報告的問題 6 / 8 / 9 與 reCAPTCHA 記進「已知缺口」並寫下不做的理由
- [x] 5.5 新踩到的坑寫進 `tasks/lessons.md`
- [x] 5.6 ⭐ **列出需要使用者手動執行的**：production 部署前必須設 `API_BASE_URL`
      （未設會啟動失敗，這是刻意的）
- [x] 5.7 `openspec archive fix-front-registration-gaps`，
      並檢查 `api-front-auth` 的 `## Purpose` 有沒有跟新的 Requirements 打架
