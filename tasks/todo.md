# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

`add-front-user-registration`（路線圖 3b）——前台的註冊與密碼重設。
目標：註冊／信箱驗證／重發／忘記密碼／重設密碼五支端點，
`user_tokens` 表（帶 purpose），以及**未驗證信箱不能聊天**的門檻。
**前台專案（獨立 repo）現在有東西可以接了。**

## 路線圖

> **2026-08-22 的兩個決定重排了整條路線**：
> 1. **前台使用者與後台帳號分成兩張表**（前台表名 `users`），前台自己註冊、要完整流程。
> 2. 先修完審查報告的 🔴 再開分表工程。
>
> 分表會動到聊天領域的每一個「member」——那些欄位**指的從頭到尾都是前台使用者**，
> 不是管理員。已完成的四個審閱頁、停權、WS 認證、presence key 全都要跟著改。
> 好消息是這些欄位**都沒有外鍵指向 members**（當初為了「帳號刪除不該由 DB 連動」而不建），
> 所以遷移是語意上的而非結構上的。

| 順序 | Change | 內容 | 狀態 |
| --- | --- | --- | --- |
| 1 | ~~`fix-unauthenticated-surface`~~ | 帳號鎖定時效、Swagger 開關、metrics 豁免收窄、`DB_PORT` 預設值 | 已合併（#20） |
| 2 | ~~`fix-presence-scan-cost`~~ | `countOnlineMembers` 改 Redis SET + `SCARD`；加守則擋「請求路徑用 scan pattern」 | 已合併（#21） |
| 3a | ~~`add-front-user-account`~~ | `users` 表 + 前台登入／更新／登出／me + 兩側各自的 secret | 已合併（#22） |
| 4 | ~~`migrate-chat-to-front-users`~~ | 聊天領域改指向 `users`；後台審閱跟著改；**停權拆成兩支**（停後台帳號 vs 停前台使用者） | 已合併（#23） |
| 5 | ~~`add-admin-front-user-management`~~ | 後台的前台使用者管理：列表／搜尋／詳情／停權／解除／強制登出。**解除了「進入點只有檢舉」的限制** | 已合併（#24） |
| 3b | `add-front-user-registration` | 註冊 + 信箱驗證 + 重發 + 密碼重設；未驗證不能聊天 | **待合併** |
| 6 | ~~`fix-permission-cache-consistency`~~ | 改角色權限時清 MemberContext 快取；`clearByMemberId` 併回 `MemberContextCachePort` | **待合併** |
| 7 | `fix-security-cleanup` | CSP 分路徑、refresh 效期、Redis fail-open 可觀測、心跳批次與防重入、文件漂移 | 未開始 |

**2 排在 3 之前的理由**：`countOnlineMembers` 是我自己剛加的錯（用了明確標注
「不可用於請求路徑」的 scan pattern），而分表會動到 presence key 的語意——先修乾淨再動。

**3 與 4 不能合併**：3 讓新體系能站著（不動既有資料），4 才切換指向。
4 一旦開始就不能留半套狀態，所以它自己要一次做完。

**5 排在 3b 之前**：分表之後，後台**沒有任何一支端點能列出前台使用者**——
只能從檢舉點進去。那讓「找一個沒被檢舉過的人」與「主動停權」都做不到，
而註冊（3b）會讓這個缺口變大（帳號會開始自己長出來）。**第 5 項已補上這個入口。**

## 待辦

### 卡在分表（做完 change 4 之後才有意義）

> change 4 已完成，以下兩項的前置條件已解除。
> **change 5 也完成了**：後台已經可以不經檢舉找到任何一個前台使用者。

- **附件訊息**：訊息帶圖片／檔案。之後加 `messageType` 欄位（預設 `TEXT`）即可，
  `content` 維持 `TEXT NOT NULL` 不需改。**真正要先想清楚的是前台的上傳授權與容量限制**——
  而「前台使用者是誰」正是 change 3 才會定下來的事。
- **訊息的保留策略**：**卡在 `seq` 缺口的設計，不是卡在清理**。
  清訊息會讓 `seq` 重新出現洞，補齊的客戶端無法區分「被清掉」與「我漏收了」，
  唯一合理的反應是反覆嘗試補同一段區間——那正是訊息撤回堅持軟刪除所要避免的問題。
  **要做的話先解這個**：讓 `roomSynced` 帶「本房間最舊的可用 seq」，客戶端才分得開。
  那會動到 WS 契約與前台（獨立 repo）。另外訊息保留本身是**產品承諾**而非技術清理。
  `retention-scope.spec.ts` 擋著誤加的清理程式碼。

### 前台專案（獨立 repo，尚未開始）

- **三個待同步項**（後端已完成、前端尚未接）：`retractedAt`、`removedAt`、
  以及 `server:sessionRevoked`——**收到後不可自動重連**，否則被停權者會進入無盡重連迴圈。
- **註冊 / 驗證信箱 / 重設密碼的畫面**（後端已完成，3b）。要接的四件事：
  1. `POST /front/auth/register` — 回 201 但**不回 token**，註冊完要自己導去登入。
  2. **`/verify-email` 這一頁必須存在**——驗證信的連結由後端接，
     驗完 302 導到 `APP_FRONT_URL/verify-email?result=success|invalid|expired`，
     前台只要讀 query 顯示三種結果。**沒有這一頁的話使用者會停在 404。**
  3. `POST /front/auth/forgot-password` / `reset-password`，
     重設信的連結指向前台的 `/reset-password?token=...`。
  4. ⚠️ **未驗證的帳號登得進來但聊不了天**（403 `EMAIL_NOT_VERIFIED`、WS 連線被拒）。
     登入回應帶 `emailVerified`，**要據此決定是導去聊天室還是導去「請收驗證信」**——
     不看它的話，使用者會在第一次進聊天室時撞上一個沒有說明的 403。
- **一開始就要走前台的認證端點**：聊天現在只吃 `/api/front/auth/login` 簽出的 token；
  後台 token 打前台端點會 401、開 WS 連線會被拒。

### 已知缺口（知情，非遺漏）

- **7 份 master spec 的 `## Purpose` 還是 archive 留下的 `TBD` 佔位字串**：
  `platform-token-scope`、`platform-public-surface`、`api-dashboard`、
  `ui-member-profile`、`ui-room-overview`、`ui-moderation`、`ui-dashboard`。
  （`api-front-auth` 那一份在 3b 順手補掉了。）`openspec archive` 只合併 `## Requirements`，**Purpose 要手動補**，
  而 `openspec validate --specs --strict` 不會抓（38/38 全過）。
  **值得開一個小 cleanup change**：補完 8 份之後加一條守則擋住
  「Purpose 含 `TBD - created by archiving`」——在補完之前那條守則會是紅的，
  所以兩件事必須同一個 change 做完。
  （順帶：archive 也不會發現舊 Purpose 與新合併的 Requirements 互相矛盾，
  `api-account-suspension` 就發生過，那個要靠人看。）

（其餘無。連線層事件限流已補上；審查報告的 🔴 在 change 1 修掉。）

### 技術債（小，隨手可修）

- **布林環境變數的解析不一致**：既有變數用 `z.string().default('false').transform(v => v === 'true')`，
  它把任何非 `'true'` 的值都當成 false——`FOO=TRUE`（大寫）或 `FOO=1` 會**靜默失效**。
  較新的 `CHAT_AUDIT_ENABLED` / `SWAGGER_ENABLED` 已改用 `z.enum(['true','false'])`
  讓 typo 在啟動時就失敗。**舊的那些還沒改**。
- **`logger.ts` 直讀 `process.env`**（`NODE_ENV` / `SERVICE_NAME` / `LOG_LEVEL`）。
  三者**都在 envSchema 裡**（審查報告說不在，那條不成立），
  直讀的理由是初始化順序——logger 早於 `getEnv()`。現場沒有註解說明這是刻意的，
  下一個看到的人會以為是漏掉然後「修好」它並引入循環相依。**加兩行註解即可**。

### 需人工處理（AI 做不到）

- **決定 CI 要不要能擋住合併**（目前擋不住，且無法設定）：branch protection 與 ruleset 在
  **Free 方案的私有 organization repo** 上都回 403（`Upgrade to GitHub Pro or make this
  repository public`）。實測於 2026-08-20。三條路徑：(a) 把 repo 改為 public——免費且立即可用；
  (b) 升級 GitHub Team；(c) 加一支 pre-push hook 在本機跑檢查——擋得住手滑，擋不住
  `--no-verify`。**在做出選擇之前，`platform-ci-quality-gate` 的保證只有「job 相依」那一半成立**
  （`build` needs `quality`），人為 merge 的那一半不成立。這是知情的缺口，不是忘記設定。

> **env 檔的協作方式**：`apps/api/.env` 與 `.env.example` 在 AI 的權限設定中被拒絕存取。
> 需要改動時由 AI 產生 `apps/api/env` / `env.example`（無點，可寫入），使用者複製過去後刪除暫存檔。
> **`.gitignore` 只擋 `.env*`，沒有點的 `env` 不在名單內**——暫存的 `env` 含真實金鑰，複製完務必刪掉。

### 觀察中

- **e2e 有間歇性失敗**：**已發生 8 次**，皆重跑後全綠。
  **第 4 次（2026-08-21，`add-admin-message-removal`）終於抓到證據**：

  ```
  ● Moderation E2E › 移除訊息 › 重複移除 → 204 且不覆寫移除時間
      read ECONNRESET
  ```

  **這推翻了原本的假設。** 先前記的是「懷疑與 ts-jest 快取或檔案 mtime 有關」，
  但 `ECONNRESET` 是**連線層錯誤，不是斷言失敗**——測試邏輯根本沒跑到。
  新的懷疑方向：supertest 對同一個 app 連續發請求時，
  keep-alive 連線被伺服器端關閉而客戶端仍在重用。
  失敗的那支測試剛好是**同一個端點連續打兩次**（重複移除的冪等測試），符合這個模式。

  **第 5 次（2026-08-21，`add-account-suspension` 的完整 e2e）——不同的測試**：

  ```
  ● Member E2E › POST /api/admin/members › 無效 email → 400
      read ECONNRESET
  ```

  **這推翻了「同端點連續兩次」的假設**（第 4 次失敗的是冪等測試，看起來像連續請求的競態）。
  這支是單獨一個 POST。目前確定的只有兩件事：**(a) 是連線層錯誤，不是斷言失敗；
  (b) 只在完整套件跑（負載較高）時出現，單獨跑該 spec 不會**。

  **2026-08-21 查過一輪，無法重現**（15 次受控執行）：

  | 條件 | 結果 |
  | --- | --- |
  | 單獨跑該 spec × 10 | 0 次失敗 |
  | 同端點連續 600 個請求（單一 spec 內迴圈） | 0 次失敗 |
  | 完整 e2e 套件 × 5 | 0 次失敗 |

  查的時候注意到 `createE2EApp` 用 `forceCloseConnections: true` 且**不呼叫 `listen()`**——
  supertest 對未監聽的 server 會自己 `listen(0)` 再 `close()`，每個請求一輪。
  推測是那個 listen/close 的競態在 CPU 壓力下窗口變寬。
  **但這個假設沒有得到證據支持，因此沒有改。**

  可以順手把 `createE2EApp` 改成只 `listen()` 一次讓它「可能」消失，
  但那是用一個猜測掩蓋另一個——這個問題已經被錯誤假設誤導三次了。

  **下次再發生時要多收集的**：失敗當下還有什麼在跑（`test:cov`？剛編譯新檔？）、
  以及 `--detectOpenHandles` 的輸出。單靠測試名稱與錯誤訊息已經不夠了。

  **抓到證據的方法**（前三次都因為 grep 管線而丟失）：
  先 `pnpm --filter @app/api test:e2e > /tmp/e2e.log 2>&1`，再從檔案 grep。

  **第 6 次（2026-08-21，`add-ws-connection-throttle`）——症狀變了，值得記**：
  同一次執行中 3 支測試失敗，**沒有任何一支是 `ECONNRESET`**：

  | 測試 | 症狀 |
  | --- | --- |
  | `Security E2E › PATCH ip-blacklist/:id` | 預期 204，收到 **401**（`缺少授權憑證`） |
  | `Member E2E › status=foo → 400` | 登入回應**沒有 `data`**（`res.body.data` undefined） |
  | `Member E2E › role/options 分頁` | 預期 200，收到 **404** |

  三支的共同點是**請求送出去了、回應也回來了，只是內容不對**——
  這與前五次「連線層錯誤、測試邏輯沒跑到」完全不同。
  立即重跑全套 **258/258 全綠**。

  **新的資訊**：這次失敗的執行是 `test:cov → test:integration → build → test:e2e`
  串在同一條指令鏈裡的最後一段，前面剛跑完用**真實 Redis** 的整合測試
  （e2e 是 mock Redis 的）。兩者共用同一個 `*_test` 資料庫。
  第二次單獨跑 e2e 就全綠——**「前面剛跑過整合測試」是目前唯一沒被排除的變因**。

  **下次要試的**：單獨跑 `test:e2e` × N 對照 `test:integration && test:e2e` × N。
  如果只有後者會壞，方向就從 supertest 轉到「整合測試留下的資料庫連線 / 資料狀態」。
  在有證據之前一樣不改。

  **第 7 次（2026-08-22，`add-admin-room-overview`）——第三種症狀**：
  `ChatReport E2E` 的 5 支測試全數失敗，錯誤都是同一句：

  ```
  thrown: "Exceeded timeout of 5000 ms for a hook."
      at beforeEach (test/e2e/chat-report.e2e-spec.ts:53:3)
  ```

  **不是斷言失敗、也不是 ECONNRESET，是 `beforeEach` 逾時**——
  `resetDb` 沒能在 5 秒內跑完。單獨跑該 spec 11 支全過，重跑完整套件 291 支全過。

  **變因累積到兩次了**：第 6 次與第 7 次的失敗執行都是
  「`test:cov`（或再加 integration）跑完後，在**同一條指令鏈**裡接著跑 `test:e2e`」。
  單獨跑 `test:e2e` 至今沒有失敗過。這是目前唯一重複出現的共同點，
  且三種症狀（ECONNRESET / 回應內容不對 / 資料庫操作變慢）都指向
  **「前面的測試留下了還沒釋放的資源」**而非測試邏輯本身。

  **下次的具體實驗**：`pnpm test:cov && pnpm --filter @app/api test:e2e` 連跑 5 次，
  對照單獨 `test:e2e` 連跑 5 次。若只有前者會壞，就去看 jest 的 `--detectOpenHandles`
  與 Prisma 連線池的釋放時機。**在有證據之前仍然不改。**

  **第 8 次（2026-08-28，`fix-permission-cache-consistency`）——症狀與第 6 次相同**：

  ```
  ● ChatReport E2E › 重複檢舉 → 回同一個 reportId，DB 只有一筆
      TypeError: Cannot read properties of undefined (reading 'accessToken')
      at login (test/e2e/chat-report.e2e-spec.ts:35:65)
  ```

  又是「登入回應沒有 `data`」——第 6 次三支失敗中的一支就是這個症狀。

  **這次做了對照，第 7 次留下的實驗有了第一筆資料**：

  | 執行 | 結果 |
  | --- | --- |
  | 完整 e2e（含本 change 的改動） | ChatReport 1 支失敗，387/388 |
  | 單獨跑 `chat-report` | 11/11 全綠 |
  | **改動全部 `git stash` 後跑完整 e2e** | **384/384 全綠** |
  | 改動 `stash pop` 還原後再跑完整 e2e | **388/388 全綠** |

  **關鍵是最後一列**：同樣的程式碼，同樣的完整套件，第一次紅、第二次綠。
  這排除了「本次改動造成」，也再次確認**不可重現**。
  值得記的是這次的失敗執行**不在指令鏈裡**——是單獨的 `pnpm test:e2e`，
  而前面幾次累積的共同點正是「跟在 `test:cov` 後面」。
  **那個共同點被這次推翻了**，第 7 次寫下的實驗設計因此需要重新想。

- **傳遞依賴漏洞（77 個）**：2026-08-20 轉 PostgreSQL 後重跑 `pnpm audit`，**數字與模板時期相同**——移除 `mysql2` 沒有減少任何一項，代表這些全都不在資料庫 driver 這條路徑上。分佈 5 low / 35 moderate / 35 high / 2 critical，多數深埋在 `apps/web > shadcn > @modelcontextprotocol/sdk` 與 `prisma` / `@nestjs/terminus` 的上游相依樹。**刻意不加 override 強制提版**——相容風險大於收益。追蹤方式：定期 `pnpm audit`，待上游更新後再評估。

### 延後功能（繼承自模板的預留）

- **帳號鎖定管理 CRUD（`add-account-lock-management`）**：後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`；前端 `/security/account-locks` 列表頁。沿用 SUPERADMIN role gate。**優先度低於 M2–M4**。

### 技術債（外部相依卡住，延後）

> **處理原則**：卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。現狀處置：api 已對齊 TS 6.0.2，`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

> 模板時期的變更歷史留在 `hexagonal-nest-express-mysql` repo，未帶入本專案。

### 2026-08-23 — 前台帳號體系（`add-front-user-account`）｜路線圖 3a

新增 `users` 表與前台的登入／更新／登出／me，**與 `members` 完全獨立**。
刻意是「純新增」：`/api/front/chat-*` 與 WS **仍然吃 admin token**，
切換是 change 4 的事（那一步一旦開始就不能留半套）。

**因此審查報告的觀察 A 只補了一半**：後台端點已拒絕前台 token，
但前台端點仍接受 admin token。另一半在 change 4。

**與審查報告建議不同的一點**：它建議共用 secret 靠 `side` claim 區分，
這裡改成**兩側各自的 secret**——差別在「某處忘了比對 side」的後果：
共用時是跨側存取，各自一組時是簽章驗證失敗（fail-closed）。

**實作中發現三道防線而非兩道**：除了 secret 與 `side` claim，
還有**兩張表的 ID 空間不相交**（前台使用者的 id 在 `members` 裡查不到）——
那是分表的附帶效果，寫 spec 時沒算到。三道任一單獨都擋得住，
所以 e2e 的「跨側 → 401」驗的是結果而非機制，機制由單元測試釘住。

**踩到的兩個坑**：`FrontJwtAuthGuard` 一度也檢查 `@Public()`，而 controller 上就掛著
（那是給全域後台 guard 看的）——結果會是兩個 guard 都放行、端點完全沒有認證。
以及 `gen:module --front` 產的是 CRUD 骨架，形狀不合 auth，已完整還原後手寫。

順手補了一條守則：**一個檔案只能有一個 `@Controller`**——
路由掃描以檔案裡的第一個當前綴，多個會讓後面的路由被算到錯的前綴下，
而那是一個「看起來正常的錯誤答案」。

### 2026-08-23 — 在線人數改用衍生索引（`fix-presence-scan-cost`）

審查報告的問題 2，也是 `add-admin-dashboard` 留下的錯：`countOnlineMembers()`
在請求路徑上掃整個 Redis keyspace，還掛在每 5 秒一次的 SSE 推送上——
而 `cache-keys.ts` 就寫著那個 pattern「不可用於請求路徑」。**註解不會失敗。**

改成 `presence:online-members` 這個衍生 Set，`SCARD` 是 O(1)。
連線紀錄本身完全不動（仍是帶心跳時間的 Hash），因此不牴觸
「不得用無時效集合儲存連線」——被禁止的是把**連線**存成集合，不是為統計而建的投影。
這個區分寫進了 spec，否則日後看到 presence 相關的 Set 會以為規則被打破。

**不用審查報告建議的計數器**：漂移方向是單向累積的（實例當機時 `markOffline` 不執行），
而「由 sweep 校正」對計數器不成立——要知道正確計數就得先知道正確集合，還是得掃。
Set 的校正在 sweep **既有的遍歷**裡順手完成，且用**差集**而非整份重建
（後者有一個窗口讓 `SCARD` 讀到 0，那個瞬間儀表板會顯示「線上 0 人」）。

新守則 `presence-scan.spec.ts` 判定以**方法**為單位而非檔案——
presence 的 adapter 同時擁有清理與查詢兩種方法，以檔案為單位會讓這次這個錯直接漏掉。

### 2026-08-23 — 未認證攻擊面修補（`fix-unauthenticated-surface`）

專案審查報告（`pr/2026-08-22-09-30-project-review.md`）的 🔴 與三個暴露面。

**帳號鎖定原本是一個沒有復原路徑的死結**：`lockedAt` 只寫入從不比對時效，
而清除它的兩條路都走不通——鎖定的檢查排在密碼驗證之前（`LoginService:108` vs `:131`），
被鎖的帳號連「密碼打對」都到不了 `resetFailedLogin`；人工解鎖需要已登入的 SUPERADMIN。
把管理員 email 全鎖一輪就沒有人能登入解鎖，而觸發鎖定不需要認證也不需要猜對密碼。

**實作中額外抓到兩件審查報告沒提的**：
1. spec 寫 `423` + `ACCOUNT_LOCKED`，程式丟的卻是 `ForbiddenException`（403）加一句
   寫死的中文——而**既有的單元測試斷言的正是 403**，測試把漂移一起釘住了。
2. `isLocked` 的布林分不出「從未鎖定」與「鎖過但已到期」，而後者**必須清失敗計數**
   （Redis 計數 TTL 30 分鐘 > 時效 15 分鐘，不清的話到期後第一次打錯就立刻重鎖，
   實際鎖定變成 30 分鐘而設定的數字看起來完全正常）。改成三態 `checkLock()`。

**審查報告有一條不成立**：問題 11 說 `NODE_ENV`/`SERVICE_NAME`/`LOG_LEVEL` 不在 envSchema，
實際上三個都在。真正的情況是 `logger.ts` 直讀 `process.env`，理由是初始化順序。

新增兩支守則：`public-surface.spec.ts`（免認證路徑必須精確比對；`app.use()` 掛載
必須列入豁免清單——那些**完全不經過 Nest 的 guard**）、以及 env 三方同步
（`.env.example` ⊇ envSchema、compose 的 api 區塊 ⊆ envSchema、容器 env ⊆ envSchema）。
後者上線第一件事就抓到本 change 自己新增的兩個變數還沒進 `.env.example`。

### 2026-08-22 — 營運總覽（`add-admin-dashboard`）｜**M4 完成**

後台原本什麼都查得到，但沒有地方回答「現在怎麼樣」。新增快照端點 + SSE 推送，
與 `/moderation/dashboard` 頁面。首頁的模板佔位文字**刻意沒改**：
首頁對所有登入者開放，而營運數字需要 `MODERATION:VIEW`。

**唯一的 migration**：`chat_messages` 加 `created_at` 索引，用 **BRIN** 而非 B-tree——
這張表 append-only 且 createdAt 單調遞增，物理順序與值天然相關，正是 BRIN 的適用條件。
實測 Prisma 7 接受 `type: Brin`，產出的 SQL 是 `USING BRIN`。

**三個實作要點**（都在 spec 裡，不只在 tasks）：一個實例只跑一個計時器
（每連線各自 setInterval 會讓管理員人數乘上資料庫負載）；
前端不能用 `EventSource`（無法帶 header，而 token 不能放 query string）；
中斷時數字要看得出來是過期的。

**順手補了一個守則盲點**：`swagger-sync` 的路由掃描器只認
`@Get|Post|Patch|Put|Delete`，**看不見 `@Sse()`**——SSE 端點對它完全隱形。
已教它認得（`Sse` 映射成 GET），補完後它立刻抓到兩支缺 yaml 的端點。

### 2026-08-22 — 聊天室總覽（`add-admin-room-overview`）

補上審閱動線最後一個斷點：原本能從檢舉查到人、從人查到房間清單，但**點不進房間**。
新增兩支端點（房間列表、單一房間概覽）與 `/moderation/rooms` 兩頁，
並把成員概覽的房間清單、房間詳情的成員清單都接成連結——
**檢舉 / 成員 / 聊天室三者現在互相連得起來**。

**訊息量不用查**：`chat_rooms.last_seq` 就是歷史訊息總數（訊息列永不刪除），
資料已經在房間那一列上。代價是語意要標明——它含已撤回與已移除的訊息。

**刻意不看訊息**：看得到房間訊息是實質擴權，從「有人檢舉才看得到那一句」
變成「能瀏覽任何房間的對話」。技術代價（新豁免、稽核、撤回內容如何呈現）是次要的，
真正的問題是「看內容必須有理由」會消失，而它消失之後沒有任何測試會變紅。

### 2026-08-22 — 成員審閱概覽（`add-admin-member-profile`）

補上審閱動線的另一半：原本只能「從檢舉查到人」，現在能「從人查到他做過什麼」。
新增三支端點（概覽、所在聊天室、相關檢舉）與 `/moderation/members/:memberId` 頁面。

第三次面對同一個權限問題——審閱要看的成員資料在 `BACKEND:ACCOUNT:VIEW` 後面——
答案同樣是「在審閱側提供它自己要的那份視圖」。概覽只回七個欄位，
e2e 用 `Object.keys().sort()` 釘住（`objectContaining` 抓不到「多回了角色」）。

**寫 spec 時漏掉一支端點**：ui spec 要求聊天室**清單**，api spec 只定義了 `roomCount`，
實作到前端才發現 admin api-client 裡沒有房間列表（`/chat/rooms` 是前台的）。
補了 `GET /moderation/members/:memberId/rooms`，複用前台「我的房間」的同一支 port 方法。

**順手修掉一個既有的 swagger 漂移**：`member-timeline.yaml` 的 `action` enum
少了後續 change 新增的四個動作（移除／還原／停權／解除），
前端型別因此看不到它們——執行期正常，所以一直沒被發現。

### 2026-08-21 — 後台檢舉審閱介面（`add-admin-moderation-ui`）

後端八個審閱端點做完後**沒有任何介面在用**，只有 e2e 測試碰過。這個 change 接起來，
並補上「一接前端就露出來」的兩個後端落差：

1. **檢舉回應只回 UUID**。前端逐列查 `/members/{id}` 在權限模型上不成立——
   那支要 `BACKEND:ACCOUNT:VIEW`，審閱人員只有 `BACKEND:MODERATION:VIEW`。
   改成後端補 email（service 層批次查一次，不在 repository join——
   `chat_reports` 刻意沒有外鍵，join 會把那個決定悄悄推翻）。
2. **詳情看不出訊息目前是否已被移除**，按鈕只能盲按。補 `targetMessageRemovedAt`
   （回時間戳不回布林：布林會讓「何時被移除」永遠拿不到）。用既有的
   `findForModeration()` 取，沒有新增訊息表的存取入口。

前端刻意不 prefetch 詳情：查詳情每次都寫 `REPORT_VIEWED` 稽核，hover 預載會製造
一堆沒有人真的看過的紀錄。**已知取捨**：每做一次處置會多一筆 `REPORT_VIEWED`，
因為處置後要重查詳情才知道新狀態——而畫面確實又顯示了一次內容。

### 2026-08-21 — WS 連線層事件限流（`add-ws-connection-throttle`）

補上最後一個已知的安全缺口。HTTP 端有全域 throttle，但連線建立後的每個 WS 事件
都是同一條 TCP 連線上的訊框，**不經過任何計次**——先前只有送訊息接了逐 use case 的限流。

做成 gateway 層的 guard 而非逐個 handler 加一行：後者會在新增 handler 時被忘記，
而「忘記」正是這個 change 要防的缺口。**沒有例外清單，`ping` 也計入**。
超過門檻時丟棄該事件並回 `WS_RATE_LIMITED`，**不斷線**——誤判的代價不對稱。

計數放本實例記憶體不走 Redis：一條連線只存在於一個實例上，跨實例一致性沒有意義，
而每個事件多一次網路往返會讓限流本身變成它要防的那種負載。代價（多開連線有多倍額度）
由 `WS_MAX_CONNECTIONS_PER_MEMBER` 管。

守則補了一條：**豁免不得以「連線層已有限流」為理由**。兩者計數單位不同，
前者取代不了後者——而日後有人看到兩處限流判斷它們重複時，被移除的通常是業務層那個。

### 2026-08-21 — M3 監控埋點（`add-chat-observability`）

Prometheus 早就掛著，但只有 Node/process 預設指標、**零自訂埋點**；WS 事件一條都不留痕跡。

**最重要的決定是「稽核什麼」的判準：證據會不會消失，而不是這件事重不重要。**
「每個動作都寫一筆」聽起來完整，但送出訊息**不該記**——`chat_messages` 已經記了發送者、
房間、時間、序號，再寫一筆只是把同一份中繼資料存兩次。真正沒有紀錄的是離開房間
（成員關係列被直接刪除，「X 曾在 Y 房間待到某時」目前不可復原）、被限流擋下、撤回被拒。
有單元 + e2e + 整合三層測試釘住「送訊息不記稽核」。

**踩到自己寫的錯註解**：稽核 adapter 我寫「開關每次讀取，這樣測試覆寫才有效」，但
`getEnv()` 內部有快取、執行期改 `process.env` 不生效，e2e 因此失敗。那對設定是正確行為，
錯的是註解與測試策略。**寫註解斷言某個機制怎麼運作之前，先確認它真的那樣運作。**

埋點位置也比原計畫多繞一層：gateway 不得觸發 DB 寫入，而 `EnsureRoomMembership` 是唯讀、
送訊息與補齊都會呼叫它——在那裡記等於每則訊息寫一筆稽核。因此抽出 `JoinRoomUseCase`。

護欄 120 → 131（稽核呼叫必須接住錯誤、application 層不得相依 `prom-client`）。

### 2026-08-21 — 訊息撤回（`add-message-retraction`）

約束在 `add-chat-messaging` 就寫好了：**必須軟刪除**，刪掉那一列會讓 `seq` 出現洞，
補齊的客戶端無法區分「被撤回」與「我漏收了」。這個 change 只是把它實作出來。

**本 change 最容易出錯的地方是內容遮蔽有三條讀取路徑**（歷史查詢、斷線補齊、即時廣播），
漏掉任何一條就是洩漏，而且不會有徵兆——測試只驗歷史查詢的話，補齊那條照樣漏。
因此遮蔽只寫在 `toMessage()` 一處、加守則限制訊息表只能有一個查詢入口、
逐條路徑各自測試。反向驗證時**兩條同時紅**，證明不是只有一條被涵蓋。

**內容保留在資料庫是刻意的、對使用者不透明的取捨**：M3 的檢舉調查需要看到被撤回的訊息，
騷擾者送完立即撤回是最典型的行為。使用者以為刪掉了，實際還在。

三處實作偏離原計畫並記進 design.md：加了 `ClockPort` 又拿掉（專案沒有時鐘抽象，
為一個 service 引入新抽象是過度設計）、`findByIdInRoom` 改名 `findOwnership` 並排除
`content`（授權判斷前不該把內容取出來）、撤回的原子性用 `updateMany` + 條件而非讀-比-寫。

護欄 111 → 120。

### 2026-08-21 — M2 訊息核心（`add-chat-messaging`）

三個只在網路不可靠時才顯形的問題，全部在第一版就決定——事後補的代價遠高於一開始做對。
eden 三件都沒做，最後的症狀是「偶爾重複、偶爾亂序、偶爾漏訊息」，每一個都難以重現。

- **重送**：`(roomId, clientMessageId)` 唯一索引；撞到時整個交易回滾，因此**重送不吃掉序號**
- **順序**：房間上的 `lastSeq` 計數器，配號與寫入在同一交易。同一房間的寫入因此被鎖序列化，
  那是刻意的——每則訊息要拿到唯一且連續的號碼，本來就無法平行
- **補齊**：`syncRoom` 帶 `lastSeq`，回應必須有 `hasMore`。沒有這個旗標，
  「補齊上限」會靜默地變成「丟訊息」

**兩個坑都出在測試輔助，不是實作**：`socket.once` 在併發等待時會被第一個事件一次觸發全部
監聽器（症狀長得完全像「伺服器序號配錯」）；自己設的限流閾值擋住併發測試，
而失敗表現成不透明的 5 秒逾時。後者促成 `waitForAck` 改為同時監聽 `error` 事件——
**逾時應該是最後手段，不是預設的失敗形式**。

限流守則刻意做成「表態式」而非猜哪些會寫入：動詞前綴判斷會讓 `ToggleReactionUseCase`
這種命名靜默漏掉，而那正是本專案已吃過三次虧的形狀。反向驗證時發現守則自己有偽陰性
（只看檔案有沒有提到 port，而我只刪了呼叫、注入還在）——**宣告相依不等於使用它**。

護欄 98 → 111；順帶釘住 `openspec/config.yaml` 的預設 schema。

### 2026-08-20 — 聊天室與成員資格（`add-chat-rooms`）

M1 的 `joinGroup` 讓任何已認證使用者拿任意識別碼就能加入房間並收到全部廣播，
而它**通過了當時全部 86 條守則**——`authorization-coverage` 只掃 `*Controller.ts`，
且它問的是「有沒有表態認證」，而 `@WsAuthenticated()` 表態了。
**連線層的認證回答「你是誰」，不回答「你可以碰哪些資源」**，這與本專案發生過的附件 IDOR
是同一個形狀。

1:1 私聊的唯一性交給 DB 的 unique index（`directKey` = 排序後串接），不用「先查有沒有」——
後者在兩人同時開啟對話時會建出兩個房間，症狀是訊息分裂而難以察覺。

**三個設計是被既有守則逼出來的**，不在原設計裡：`@MemberScoped()`（前台的授權是成員資格，
不是權限碼；與其放寬規則不如新增一種只能用在前台的表態方式）、`MemberPersistenceModule`
（帳號的 out port 住在 `modules/admin/` 之下本來就是錯的位置）、`ChatRoomCoreModule`
（打斷 WS 與前台的模組循環，沒有用 `forwardRef` 遮）。

修守則時自己製造了一個偽陰性，被守則自己的合成測試抓住：註解裡提到的裝飾器會把定位起點
拉進註解內部，讓 `stripComments` 失效。**正確順序是先去註解再定位。**

護欄 86 → 97。

### 2026-08-20 — 工程基礎的兩處補強

**`improve-ci-run-integration-tests`**：M1 交付了 11 條證明跨實例廣播成立的測試，但沒有自動化執行路徑——CI 只跑 unit + e2e，而 e2e 把 Redis mock 掉。**CI 綠燈當時不代表跨實例廣播還活著。** 新增 `integration` job（CI 首次需要 Redis service）。實測只讓 pipeline 多 4 秒，因為它與 `quality`（關鍵路徑）平行跑。

盤點時發現整合測試的 Redis 連線**是靠巧合對上的**：本機 `.env` 給 6389、CI 落到 envSchema 預設的 6379，剛好等於 service container 的埠。已改為明示宣告。

**`improve-openspec-ws-prefix`**：M2 的事件契約沒有地方可寫——`api-` 強制 HTTP 請求/回應，WS 事件沒有 status code。新增第四類前綴 `ws-`（不分側），並定義兩個方向的必填區塊（`client:` 需 Payload / Ack / Failure，`server:` 需 Payload）。

**順帶修掉一個既有 bug**：`body.includes('**Success Response**')` 無法區分「使用區塊」與「行文提及」——把規則寫進 spec 後，**那份描述規則的 spec 被自己的規則抓出來**。`api-*` 的正向檢查也有同樣問題，且方向更危險（行文提及會誤判為通過）。兩處改用行首匹配。

護欄 79 → 86。新規則在 M2 之前沒有真實樣本，正確性由 6 條合成輸入測試 + 臨時造違規 spec 的反向驗證保證。

### 2026-08-20 — M1 WebSocket 地基（`add-websocket-foundation`）

**驗收條件達成**：起兩個 API 實例，A 實例送出的群組事件 B 實例的連線收得到——eden 跑了很久都證明不了這件事，現在有一條會失敗的測試守著（`test/integration/ws-cross-instance.integration-spec.ts`，11 條）。

**刻意避開 eden 的四個坑**：presence 從記憶體 Map 改為 Redis Hash + 心跳（實例被 kill 後紀錄自動失效）、裝上 `@socket.io/redis-adapter`、gateway 只做轉譯（由守則強制）、WS 認證與 HTTP 共用同一份 `ResolveMemberContextUseCase`。最後一項尤其關鍵——eden 為 WS 重寫了一份判定邏輯並漏掉 `tokenVersion` 比對，導致強制登出對 WS 連線無效，且沒有任何徵兆。

**補了三條守則**（68 → 79 項）：既有規則對 WS 層有系統性的涵蓋缺口——`layering.spec.ts` 只 filter `*Controller.ts`、`dto-from-zod` 與 `authorization-coverage` 只掃 `adapter/in/web`。規則都存在、都正確，只是看不到新的進入點。**eden 那個 544 行的肥 gateway 原本可以在這裡原封不動重演一次，一路綠燈。**

**整合測試抓到一個 production bug**：`NestFactory.create()` 不跑 `onModuleInit`，而 WS adapter 必須在 `app.listen()` 之前掛上——`main.ts` 有一模一樣的問題，只是還沒人啟動過 dev server。單元測試與 e2e 都驗不到（e2e mock 掉 Redis、也不掛 adapter）。

**新增測試層**：`test/integration/`，用真 Redis 起多個實例。與 e2e 的前置條件相反，因此獨立成一套 jest 設定。

**M1 不含**：訊息、房間、已讀、ack、去重、斷線補齊（M2）；監控埋點（M3）。

### 2026-08-20 — M0 專案骨架

從 `hexagonal-nest-express-mysql` 模板衍生出 nexus 後端，兩支 change 走完 propose → apply → archive。

**`refactor-switch-to-postgres`** — MySQL/MariaDB → PostgreSQL 17。六角架構把資料庫關在 `adapter/out/persistence` 與 `infrastructure/prisma` 之內，`application` 與 `domain` 兩層零改動，這是「現在換」可行的原因。

三件事只有做了才會發現：

- **PostgreSQL 的 `DELETE` 不支援 `LIMIT`** —— 日誌清理的分批刪除會直接爆，改走 `ctid IN (SELECT … LIMIT n)`。反向驗證（把 `<` 改成 `>`）確認 3 支 e2e 真的變紅，證明測試在驗 SQL 本身而非只是跑過。
- **容器 healthcheck 必須用 `pg_isready`** —— 官方映像初始化期間會先起一次臨時伺服器，只探行程或埠會誤判為就緒。已寫成 `platform-container-dev` 的需求。
- **`compose-files.spec.ts` 擋下了我** —— 它要求 compose 的對外埠必須寫進 README，把文件變成鏈式依賴而非事後補。

順帶把 UTC 保證從 driver 參數（`timezone: 'Z'`）移到欄位層 `@db.Timestamptz(3)`：前者寫在 `PrismaService` 建構子裡，改連線設定時漏掉那行就靜默失效；後者由 schema 保證。並補上 11 表 / 69 欄位的 `///` 描述 + `COMMENT ON`，新增 `gen:comments` 產生器避免兩邊漂移。

**`refactor-migrate-ci-to-github-actions`** — CI 從沒人執行的 GitLab 設定搬到 GitHub Actions。6 個 job 砍成 3 個：`npm-install`、`cleanup`、`pr_agent` 都是為了繞過 GitLab 限制而存在，在 GitHub 上沒有意義。最有價值的是**移除 15 行的等待迴圈**——GitHub Actions 的 service container 支援 healthcheck，CI 與本機從此共用同一套 `pg_isready` 判定，原本「兩套各自會出錯的機制」消失。順手刪掉 `scripts/init-project.sh`（模板衍生腳本，第 3 步是 `rm -rf .git`，在此只有誤執行毀掉歷史的風險）。

**驗收**：`docker:deps` / `db:migrate` / `typecheck` / `lint` / `test`（單元 281 + 護欄 68）/ `build` 六項全綠，e2e 151 支對真實 PostgreSQL 通過。

**本輪解決的模板遺留待辦**：`.env.example` 補 `ALLOW_PROD_SEED`（已隨 PostgreSQL 設定一併重寫）。
