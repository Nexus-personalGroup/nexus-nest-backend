## Context

路線圖 3b。3a 建好了 `users` 與前台認證但刻意不做註冊，4 與 5 把聊天與後台管理接上，
現在補最後一塊：**讓使用者自己進得來**，以及忘記密碼時回得來。

這個 change 的難處不在寫五支端點，而在**每一支都是未認證可達的**——
它們是整個系統對外最寬的那個面。三件事要一起想清楚：
帳號存在與否會不會外洩、token 怎麼存、未驗證的帳號能做什麼。

## Goals / Non-Goals

**Goals:**

- 使用者能自己註冊、驗證信箱、忘記密碼時自己救回來。
- **未驗證的信箱不能聊天**，而且擋的位置是集中的、有守則守著的。
- 五支端點都不洩漏「這個信箱有沒有註冊過」。
- 註冊與重發都擋得住「拿服務當垃圾信跳板」。

**Non-Goals:**

- **不做 reCAPTCHA**（見 Open Questions）、不做社群登入。
- **不做登入狀態下的改密碼**——威脅模型不同（那裡要驗舊密碼），不該一起做。
- **不做前端畫面**。
- **不動後台的忘記密碼流程**，一行都不改。

## Decisions

### D1：一張 `user_tokens` 帶 `purpose`，不是兩張表

驗證信與密碼重設的 token 欄位**完全相同**：雜湊、效期、使用時間、擁有者。
差別只在語意。

| 做法 | 評估 |
| --- | --- |
| **一張表 + `purpose` enum** | 一份 schema、一份 repository、一支清理排程 |
| 兩張表 | 型別上不可能拿驗證信的 token 去改密碼。代價是兩套完全相同的東西 |
| 沿用 `password_reset_tokens` 加 `user_id` | `member_id` 與 `user_id` 都得 nullable，而「兩個都 null」與「兩個都不是 null」在型別上都合法——一個 DB 擋不住的無效狀態 |

選第一個。**「拿錯 purpose 的 token」由查詢條件擋**：每一支消費 token 的
service 都 `where { token: hash, purpose: 'X' }`，查不到就是無效。
這比兩張表少了一整套重複，而防護強度相同——**只要那個 `purpose` 條件不能忘**，
因此它會有一支單元測試釘住：拿 `RESET_PASSWORD` 的 token 去驗證信箱要失敗。

**沿用後台 `password_reset_tokens` 的三個決定**（它們已經想清楚過）：
只存 sha256 雜湊（資料庫外洩 ≠ 可以重設任何人的密碼）、
使用後保留紀錄而非刪除（查得到「何時被誰用掉」）、
成功後作廢該使用者的其他同 purpose token。

### D2：未驗證信箱「能登入、不能聊天」，門檻集中在一個 Guard

三個候選：

| 做法 | 評估 |
| --- | --- |
| **能登入、不能聊天** | 使用者知道自己卡在哪、能自己重發驗證信 |
| 完全不能登入 | 實作最省，但重發驗證信得做成一支**不需要登入、只吃 email** 的端點——那就是一個可以拿來探測「這個信箱有沒有註冊過」的點 |
| 不擋，只是個標記 | 機器人帳號註冊完就能直接洗版 |

選第一個。**代價是多一個「半登入」狀態**，而那個狀態如果散在每一支端點裡檢查，
漏一支就是一個洞。因此：

- `UserContext` 增加 `emailVerified: boolean`（來自 `emailVerifiedAt != null`）。
- 新增 `EmailVerifiedGuard`，掛在三支 chat controller 上（`FrontJwtAuthGuard` 之後）。
- **加一條守則**：`web/front/` 下**掛了 `FrontJwtAuthGuard` 的 controller**，
  除非在豁免清單裡，否則必須也掛 `EmailVerifiedGuard`。
  目前唯一的豁免是 `FrontMeController`——使用者要看得到自己的驗證狀態才知道卡在哪。

沒有那條守則的話，日後新增一支前台聊天端點會**預設對未驗證帳號開放**，
而那不會有任何徵兆。這與 `add-admin-attachment` 踩過的是同一種缺陷：
**它遵守了所有現存規則，只是缺少沒有規則要求它具備的東西**。

WS 連線同樣要擋，但**不是靠 Guard**：連線的認證在 `handleConnection` 裡，
那裡直接讀 `UserContext.emailVerified` 並以既有的拒絕路徑斷線。

### D3：五支端點都不洩漏「這個信箱是否存在」

這是本 change 最容易做錯的地方，因為**正確的行為看起來像壞掉**。

| 端點 | 信箱不存在時 | 理由 |
| --- | --- | --- |
| `POST /register` | 回 `409 EMAIL_ALREADY_EXISTS` | **這一支例外**，見下 |
| `POST /resend-verification` | 回 `204`，什麼都不做 | 不能讓它變成探測點 |
| `POST /forgot-password` | 回 `204`，什麼都不做 | 沿用後台既有的判準 |
| `GET /verify-email` | 一律導回前台帶失敗結果 | token 無效與過期不可區分 |
| `POST /reset-password` | 回 `400 INVALID_TOKEN` | 同上，不區分無效／過期／已用 |

**註冊為什麼例外**：不回 409 的話使用者收不到任何有用的回饋——
他會以為註冊成功然後永遠等不到信。而「這個信箱能不能註冊」本來就是
註冊表單必須回答的問題，藏不住。**真正要擋的是把它自動化**，那是節流的工作（D5）。

**已註冊但未驗證的信箱再次註冊**：回 `409`，並**順便重發一次驗證信**——
這是使用者最常見的實際情境（信被歸到垃圾信匣，於是他重新註冊一次），
擋掉他等於逼他去用另一個信箱。重發同樣受 D5 的信箱節流約束。

### D4：驗證連結由**後端**接，驗完 302 導回前台

信裡的連結直接指向 `GET /api/front/auth/verify-email?token=...`，
後端驗完之後 `302` 導向
`${APP_FRONT_URL}${APP_FRONT_VERIFY_REDIRECT_PATH}?result=success|invalid|expired`。

**不讓前台頁面接**（`/verify-email?token=` → 前端再 POST）：那個做法面向未來比較正確，
但**前台 repo 還沒開始**，這條流程會在很長一段時間內沒有任何人驗得到。
後端接的版本現在就跑得起來，而且 token 不必交給前端 JS。

**GET 帶副作用是刻意的**，理由與代價都要寫清楚：信件裡只能放連結，
而連結只有 GET。代價是**預抓（prefetch）與郵件安全掃描會提前把 token 用掉**——
使用者點下去時看到「連結已使用」。緩解是**驗證成功是冪等的**：
已驗證的帳號再次帶同一個 token 進來，仍然導向 `result=success`
而不是 `invalid`。（token 本身仍然標記 usedAt，只是結果對使用者一致。）

日後前台要自己接時，加一支 `POST /verify-email` 即可，GET 那支可以同時留著。

### D5：IP 與**信箱**兩層節流，缺一不可

兩者擋的是不同的形狀：

- **IP 節流**擋「同一個來源大量註冊」——但擋不住分散式來源。
- **信箱節流**擋「對同一個信箱反覆發信」——那是拿服務當垃圾信跳板的形狀，
  而它只需要**一個** IP。

只做 IP 節流的話，攻擊者拿到一個受害者的信箱位址，就能用你的 SMTP 對他轟炸。
只做信箱節流的話，一個 IP 可以對一萬個信箱各發一封。

`POST /register` 與 `POST /resend-verification` 兩支都套。
信箱節流的計數鍵是**正規化後的 email**（小寫、去空白），
不然 `Foo@x.com` 與 `foo@x.com` 會是兩個獨立的額度。

**節流命中時回什麼**：`429`。這裡**不**沿用 D3 的「一律 204」——
節流是對呼叫者的資源限制，與帳號是否存在無關，回 429 不會洩漏任何東西。

### D6：seed 的既有使用者要標成已驗證

3a 的 `seed-test-users` 建的三個帳號 `emailVerifiedAt` 都是 null。
本 change 之後他們**會聊不了天**，而所有聊天相關的 e2e 與整合測試都用他們。

seed 一併補上 `emailVerifiedAt`，並**留一個刻意未驗證的帳號**
（`unverified@test.com`）——那個狀態需要有東西可以驗。

`test/helpers/db.ts` 的 `seedUser` 預設 `emailVerifiedAt` 為**已驗證**：
既有的聊天測試沒有一支關心驗證狀態，讓它們全部去補一個參數是噪音。
要驗未驗證的情境時明確傳 `verified: false`。

## Risks / Trade-offs

- **[GET 帶副作用被預抓提前消耗]** → 驗證成功冪等（D4）。無法完全消除，
  但使用者看到的結果是對的。
- **[`UserContext` 加欄位波及所有讀取端]** → 那是型別會抓到的破壞，
  比「忘了檢查」好。編譯過了就代表每一處都處理過。
- **[SMTP 未設定時註冊會怎樣]** → 沿用後台的做法：寄信**不 await**、
  失敗只記 log，不讓註冊本身失敗。代價是使用者收不到信而系統看起來正常——
  因此 `NodemailerEmailAdapter` 的失敗必須進 log，且 production 缺 SMTP 設定
  要在啟動時就被 `productionErrors` 擋下。
- **[已註冊未驗證的信箱被別人再次註冊]** → 回 409 並重發驗證信到**原信箱**，
  不會把任何資訊給到第二個人，也不會覆蓋原帳號的密碼。

## Migration Plan

1. `pnpm --filter @app/api db:migrate --name add_user_tokens`
   （新表 + 新 enum，無資料變動）。
2. `pnpm --filter @app/api db:seed` — 既有的測試使用者補上 `emailVerifiedAt`
   （`seed-test-users` 需改成 `alwaysRun`，否則跳過就補不到——
   這正是 `add-admin-front-user-management` 踩過的那個洞）。
3. **`.env` 要補四個變數**，其中 `APP_FRONT_URL` 在 production 為必填。
   由我產生 `env` / `env.example` 暫存檔給你複製。

## Open Questions

- **reCAPTCHA 什麼時候加**：等前台 repo 開始、且真的觀察到程式化註冊時。
  加的位置是 `POST /register` 的可選欄位（與登入同形狀），不需要改流程。
- **驗證信的效期設多久**：本 change 用 24 小時（`EMAIL_VERIFICATION_EXPIRES_IN`）。
  太短會讓「隔天才看信」的人失敗，太長讓一個被轉寄的信長期有效。
  重發成本很低，所以偏短是安全的方向——但真正的數字要等有使用者行為再調。
- **未驗證帳號要不要有存活期限**（例如 7 天未驗證就刪除）：目前不做。
  刪除牽涉「這個信箱能不能重新註冊」與既有資料的歸屬，是獨立的一件事。
