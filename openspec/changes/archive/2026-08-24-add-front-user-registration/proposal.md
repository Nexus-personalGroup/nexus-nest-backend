## Why

前台使用者目前**只能由 seed 產生**。`add-front-user-account`（3a）建好了 `users` 表
與登入／登出／refresh／me，但刻意沒做註冊——那是一整條需要信箱驗證的流程，
不該夾帶在「讓新體系能站著」那個 change 裡。

在它做完之前，前台專案（獨立 repo）**連第一個畫面都做不出來**：
沒有註冊就沒有使用者，沒有使用者就沒有可以聊天的人。

順帶要補的是**密碼重設**。後台早就有（`ForgotPasswordService` / `ResetPasswordService`），
前台一支都沒有——使用者忘記密碼就等於永久失去帳號。

## What Changes

- **新增 `user_tokens` 表**：一次性 token，帶 `purpose`（`VERIFY_EMAIL` / `RESET_PASSWORD`）。
  只存 sha256 雜湊，不存明文。
- **五支新端點**（`/api/front/auth/*`，全部 `@Public()`）：
  - `POST /register` — 註冊，建立未驗證的帳號並寄出驗證信
  - `GET /verify-email?token=` — 點信裡的連結，驗完 **302 導回前台**
  - `POST /resend-verification` — 重發驗證信
  - `POST /forgot-password` — 申請密碼重設
  - `POST /reset-password` — 以 token 設定新密碼
- **未驗證信箱的門檻**：可以登入、可以看 `/front/me`，
  但**聊天全部擋下**（三支 chat controller + WS 連線）。
- **`UserContext` 增加 `emailVerified`**，並新增 `EmailVerifiedGuard` 與一條守則
  要求前台的聊天 controller 必須掛它。
- **新增錯誤碼 `EMAIL_NOT_VERIFIED`**（403）。
- **濫用防護**：註冊與重發都吃 IP 節流與**信箱節流**。
- **新增環境變數**：`APP_FRONT_URL`、`APP_FRONT_VERIFY_REDIRECT_PATH`、
  `EMAIL_VERIFICATION_EXPIRES_IN`、`FRONT_PASSWORD_RESET_EXPIRES_IN`。

**不做**：

- **reCAPTCHA**——前台 repo 還沒開始，接了也沒有人驗得到。IP + 信箱雙重節流
  已經擋掉「同一個 IP 對很多信箱各發一封」與「對同一個信箱轟炸」兩種形狀。
  日後要加時它是一個獨立的決定（見 design 的 Open Questions）。
- **社群登入**（Google / Apple）。
- **改密碼**（登入狀態下的 change password）——那是 `/front/me` 的範圍，
  與「忘記密碼」的威脅模型不同，不該一起做。
- **後台對前台使用者的密碼操作**。`add-admin-front-user-management` 明確排除了。
- **前端畫面**——前台是獨立 repo 且尚未開始；`apps/web` 是後台，不碰。

## Capabilities

### Modified Capabilities

- `api-front-auth`：新增註冊、信箱驗證、重發驗證信、忘記密碼、重設密碼五支端點，
  以及「未驗證信箱的存取限制」這條跨端點的規則。
- `platform-websocket-transport`：連線除了要通過認證，還要求信箱已驗證。

## Impact

- **DB**：新增 `user_tokens` 表與 `user_token_purpose` enum——**需要 migration**。
  `users` 表**沒有欄位變動**（`emailVerifiedAt` 3a 就建好了）。
- **後端**：`front/auth` 新增 5 支 service 與對應的 port；
  `UserContext` 多一個欄位（**會波及所有讀取它的地方**）；
  新增 `EmailVerifiedGuard` 掛在三支 chat controller 上；`ChatGateway` 加一道檢查。
- **環境變數**：4 個新的，全部要進 `envSchema`；`APP_FRONT_URL` 在 production 為必填
  （沒有它驗證信的連結會指向 undefined）。
- **信件**：沿用既有的 `SendEmailPort` 與 `NodemailerEmailAdapter`，不新增 adapter。
- **既有行為**：登入流程**多一個 `emailVerified` 欄位**在回應裡；
  已存在的 seed 使用者未驗證，跑完這個 change 之後**會聊不了天**——
  seed 要一併把他們標成已驗證（見 tasks）。
- **前台專案**：註冊與重設密碼的畫面是它的事；驗證連結**不需要它先存在**
  （後端 GET 直接處理，見 design D4）。
