## Why

2026-08-30 審查報告的問題 1～5，**五項逐項驗證屬實**。
它們全部集中在前台註冊流程——那是唯一還沒經過一輪審查的區域
（上一輪的 11 個問題修完之後，舊區域這次一個新問題都沒有）。

**節奏上這不是 hotfix。** 報告把問題 1 寫成「新使用者永遠驗證不了信箱」，
技術上正確，但**前台是獨立 repo 且尚未開始**——`APP_FRONT_URL` 預設指向的 5174
上面現在什麼都沒有，今天沒有任何使用者被卡住。兩個 🔴 的正確定位是
**「前台上線前必修」**，而現在正是修它最便宜的時候。

五項有一個共同形狀：**每一項的正確答案早就寫在這個 codebase 裡了**，
只是沒有走完最後一步——`API_BASE_URL` 定義好放著沒人用、
IP 封鎖的防線寫在註解裡但沒接上、P2002 在其他四張表都接了只有新表漏掉、
「能收到信就證明他擁有信箱」這句話已經白紙黑字寫在忘記密碼的註解裡。

## What Changes

- **驗證信的連結改用 `API_BASE_URL`**：現在拿 `APP_FRONT_URL`（前台網站根位址）
  當後端路由的 base，寄出去的連結指向一個前台網站上不存在的路徑。
  `API_BASE_URL` 一併從 `optional()` 改為有預設值並列入 `productionErrors`。
  **BREAKING（部署面）**：production 未設 `API_BASE_URL` 將無法啟動；
  沒有資料或 API 契約變更。
- **前台登入與所有寄信端點加上端點層 `@Throttle`**：八支前台 auth 端點
  目前**一個都沒有**，唯一防護是全域的 100 次／分鐘／IP。
- **`IpBlockPort` 接上前台登入**，讓 `FrontLoginService` 註解描述的那條防線
  真的存在。註解一併改掉——**描述了不存在防線的註解比沒有註解更危險**。
- **`PrismaUserRepository.create()` 接住 P2002**，併發註冊同一信箱回 `409`
  而非 `500`。
- **重設密碼成功時一併標記信箱已驗證**：重設信送到該信箱、能收到就證明擁有它，
  那與驗證信證明的是同一件事、用的是同一套 token 機制。

## Capabilities

### Modified Capabilities

- `api-front-auth`：
  - **新增**「驗證信的連結必須指向後端」——既有的「信箱驗證」需求只規範了
    302 導回哪裡，從來沒有規範**信裡那個連結長什麼樣**，而錯的正是它。
  - **新增**「認證端點必須有端點層節流」。
  - **修改**「前台登入」——補上端點層節流與 IP 失敗計數，
    讓需求裡已經寫著的 `APPLICATION_IP_BLOCK_THRESHOLD` 成為真的。
  - **修改**「前台註冊」——併發註冊同一信箱 MUST 回 `409` 而非 `500`。
  - **修改**「前台重設密碼」——成功時 MUST 一併標記信箱已驗證。

## Impact

**程式碼**：

| 檔案 | 改動 |
| --- | --- |
| `apps/api/src/infrastructure/validate-env.ts` | `API_BASE_URL` 給預設值 + 列入 `productionErrors` |
| `apps/api/src/application/service/front/auth/VerificationMailService.ts` | 連結改用 `API_BASE_URL` |
| `apps/api/src/adapter/out/persistence/user/PrismaUserRepository.ts` | `create()` 接 P2002 |
| `apps/api/src/application/service/front/auth/FrontResetPasswordService.ts` | 成功時 `markEmailVerified` |
| `apps/api/src/application/service/front/auth/FrontLoginService.ts` | 注入 `IpBlockPort` + 改註解 |
| `apps/api/src/adapter/in/web/front/auth/FrontAuthController.ts` | 八支端點的 `@Throttle` |
| `apps/api/src/modules/front/auth.module.ts` | `IpBlockPort` 接線 |

**測試**：`VerificationMailService` 需要一支**直接斷言連結字串**的單元測試
——那是整個測試矩陣缺的形狀（e2e 打的是路徑，跑被測 app 自己的 base URL，
驗不到組給外部世界的字串）。其餘四項各需單元測試；節流需 e2e。

**環境變數**：`API_BASE_URL` 從選填變成有預設值的必填（production）。
`.env.example` 同步；**本機不需要改**（預設值即為 `http://localhost:3000`）。

**沒有**：schema 變動、migration、module 歸屬調整。
