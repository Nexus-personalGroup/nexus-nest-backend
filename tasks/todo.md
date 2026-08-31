# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

無。`fix-front-registration-gaps`（路線圖 8）已完成待合併。

**下一步沒有已排程的項目**——候選見「待辦」，其中
**前台專案（獨立 repo）現在真的可以開工了**：註冊流程的兩個 🔴 都修掉，
驗證信的連結不再是壞的。

## 路線圖

**目前沒有在飛的項目**，也**沒有已排程的序列**——候選與各自卡在什麼，見下面的「待辦」。

### 已走完：2026-08-20 → 08-31，28 支 PR

M0 骨架 → M1 WS 地基 → M2 訊息核心 → M3 監控 → M4 營運總覽，
接著是**分表工程**（3a 建新體系 → 4 切換指向 → 5 補後台入口 → 3b 註冊流程），
中間穿插兩輪審查報告的修補（1、2、6、7、8）。詳見「已完成」的索引。

三個排序判斷值得留著，因為它們是**判斷**而不是結果：

- **2 排在分表之前**：`countOnlineMembers` 用了明確標注「不可用於請求路徑」的
  scan pattern，而分表會動到 presence key 的語意——**先修乾淨再動**。
- **3a 與 4 不能合併**：3a 讓新體系站著（純新增、不動既有資料），4 才切換指向。
  **4 一旦開始就不能留半套狀態**，所以它自己要一次做完。
- **5 排在 3b 之前**：分表之後後台只能從檢舉找到前台使用者，
  而註冊（3b）會讓帳號開始自己長出來——**缺口會在那一刻變大**，所以先補入口。

**第二輪審查（2026-08-30）的分布本身是訊號**：9 個問題有 6 個集中在 3b，
而那是唯一還沒經過審查的區域；舊區域一個新問題都沒有。
**change 合併後排一次審查，比累積到季末一起看划算。**

## 待辦

### 聊天功能的下一批（前置條件已解除）

> 原本卡在分表。change 4（切換指向）與 5（後台入口）都完成了，
> 以下兩項現在都可以動——真正的門檻各自寫在條目裡。

- **附件訊息**：訊息帶圖片／檔案。之後加 `messageType` 欄位（預設 `TEXT`）即可，
  `content` 維持 `TEXT NOT NULL` 不需改。**真正要先想清楚的是前台的上傳授權與容量限制**
  ——「前台使用者是誰」已由 3a／3b 定下來了，所以現在缺的只有授權規則本身：
  既有的附件上傳掛在 `BACKEND:ATTACHMENT:EDIT` 之後，那是後台權限碼，
  前台沒有權限碼的概念（授權單位是成員資格）。**要先決定前台憑什麼可以上傳。**
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
     （連結的 base 曾經組成 `APP_FRONT_URL` 而不是後端位址，寄出去的信全是壞的，
     已由 change 8 修掉；現在由一支直接斷言連結字串的單元測試守著。）
  3. `POST /front/auth/forgot-password` / `reset-password`，
     重設信的連結指向前台的 `/reset-password?token=...`。
  4. ⚠️ **未驗證的帳號登得進來但聊不了天**（403 `EMAIL_NOT_VERIFIED`、WS 連線被拒）。
     登入回應帶 `emailVerified`，**要據此決定是導去聊天室還是導去「請收驗證信」**——
     不看它的話，使用者會在第一次進聊天室時撞上一個沒有說明的 403。
- **一開始就要走前台的認證端點**：聊天現在只吃 `/api/front/auth/login` 簽出的 token；
  後台 token 打前台端點會 401、開 WS 連線會被拒。

### 已知缺口（知情，非遺漏）

- **5 份 master spec 的 `## Purpose` 還是 archive 留下的 `TBD` 佔位字串**：
  `api-dashboard`、`ui-member-profile`、`ui-room-overview`、`ui-moderation`、`ui-dashboard`。
  （`api-front-auth` 在 3b、`platform-token-scope` 與 `platform-public-surface`
  在 change 7 順手補掉了——那兩支本來就要動。）`openspec archive` 只合併 `## Requirements`，**Purpose 要手動補**，
  而 `openspec validate --specs --strict` 不會抓（38/38 全過）。
  **值得開一個小 cleanup change**：補完 8 份之後加一條守則擋住
  「Purpose 含 `TBD - created by archiving`」——在補完之前那條守則會是紅的，
  所以兩件事必須同一個 change 做完。
  （順帶：archive 也不會發現舊 Purpose 與新合併的 Requirements 互相矛盾，
  `api-account-suspension` 就發生過，那個要靠人看。）

- **WS 連線數上限有 TOCTOU**（審查報告問題 10）：`ChatGateway` 先 `getConnections()` 讀、
  再比對 `WS_MAX_CONNECTIONS_PER_MEMBER`、再 `markOnline()` 寫——兩條同時進來會都通過檢查。
  **change 7 刻意不做**：預設上限 10，超個一兩條沒有實質危害，
  而修法要在寫入後回讀、超額再回收自己剛寫的那筆，複雜度與收益不成比例。
  真的要準確時再處理，屆時 `markOnline` 是唯一要改的地方。

- **第二輪審查（2026-08-30）刻意不做的四項**：
  - **reCAPTCHA 沒有接上前台**（問題 3 的一半）。port 與 adapter 都已存在（後台登入在用），
    技術上不難。不做的理由是**它需要前台配合**——前台要嵌 widget、處理 token，
    而前台是還沒開始的獨立 repo。等前台開工時一起做，那時能真的端到端驗一次。
  - **`listUsers` 的模糊搜尋會全表掃描**（問題 6）：`contains` + `insensitive` 翻成
    `ILIKE '%x%'`，`email` 的 unique index 用不到、`displayName` 沒有索引。
    **現在不動**——報告自己也說先別動。要動時 `displayName` 加 `pg_trgm` GIN、
    `email` 改前綴搜尋（用得到既有索引）是成本最低的兩步，先確認要哪一種搜尋語意再選。
  - **建群組可以把任何人拉進來，對方沒有同意權**（問題 8）。這是**產品決策不是 bug**：
    未經同意的群組邀請是已知的騷擾管道（建群、發言、退群，受害者只能事後檢舉）。
    值得在路線圖占一格，例如「新成員在對方首次發言前只看得到房間存在」或最小可行的封鎖名單。
  - **`MemberNotFoundException` 讓建群組成為 UUID 探測器**（問題 9）：整批失敗的設計是對的
    （略過不合格者會讓呼叫端以為所有人都加入了），代價是可以逐一驗證 UUID。
    UUID 不可猜測，只有在 ID 從別處洩漏時才有意義——**記錄下來，不建議為此改設計**。

（其餘無。連線層事件限流已補上；第一輪審查報告的 🔴 在 change 1 修掉、
🟡🟢 在 change 7 收完；第二輪的 1～5 是 change 8。）

### 技術債（小，隨手可修）

- **布林環境變數的解析不一致**：既有變數用 `z.string().default('false').transform(v => v === 'true')`，
  它把任何非 `'true'` 的值都當成 false——`FOO=TRUE`（大寫）或 `FOO=1` 會**靜默失效**。
  較新的 `CHAT_AUDIT_ENABLED` / `SWAGGER_ENABLED` 已改用 `z.enum(['true','false'])`
  讓 typo 在啟動時就失敗。**舊的那些還沒改**。

- **`RevokeMemberSessionsService` 住在 `chat-ws.module` 裡**。於是
  `admin/member.module` 只是為了「停用帳號要踢掉既有連線」，就得 import 整個聊天 WS 模組。
  **這是接線的意外，不是設計**——與 change 6 修掉的
  「`clearMemberContext` 長在 `RedisTokenBlacklistAdapter` 裡」是同一類問題：
  功能落在一個與它名字無關的模組，改動時第一個打開的檔案裡沒有它。
  拆成獨立的 `session-revocation.module` 即可，成本很小。
  **併進下一個會動到 module 接線的 change 順手做**，不值得單獨開一個。

- **`domain/exception` 40 支檔案攤平在一層**，而且每個 change 幾乎都會再加一兩支。
  自然的分組是 `auth/`（11）、`member/`（7）、`role/`（6）、`chat/`（9）、
  `attachment/`（3），`DomainException` 與 `IpListNotFoundException` 留根。
  **但現在不要做**：89 個檔案、149 行 import 會被改到，零行為變化，
  換來的只是「找檔案時少捲一點」——而實際找例外是打名字跳轉，分層對此沒有幫助。
  真要做就**綁在下一個會新增例外的 change 裡**，那時 `gen-module.ts` 那 5 處寫死的
  `domain/exception/%Name%NotFoundException` 才有真實案例逼你決定新例外落在哪一群
  （傾向讓產生器一律寫進 `domain/exception/<module>/`，與它已在做的分側一致）。
  兩支守則（`no-inline-message` / `response-codes`）用的是遞迴掃描，不必跟著改。

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

> **完整的設計、取捨與 tasks 都在 `openspec/changes/archive/<日期>-<名稱>/`；
> 踩過的坑在 `tasks/lessons.md`。** 這裡只留索引，加上少數「只存在於這裡」的判斷
> ——那些是跨 change 的觀察，不屬於任何一支的 design.md。
>
> 模板時期的變更歷史留在 `hexagonal-nest-express-mysql` repo，未帶入本專案。

### 索引

| PR | 日期 | Change | 一句話 |
| --- | --- | --- | --- |
| #1 | 08-20 | `refactor-switch-to-postgres` | MySQL → PostgreSQL 17；六角架構讓 application / domain 零改動 |
| #2 | 08-20 | `refactor-migrate-ci-to-github-actions` | 6 個 job 砍成 3 個；service container 的 healthcheck 取代 15 行等待迴圈 |
| #3 | 08-20 | `add-websocket-foundation` | **M1**：presence 進 Redis、裝 redis-adapter、WS 與 HTTP 共用同一份認證判定 |
| #4 | 08-20 | `improve-ci-run-integration-tests` | 跨實例廣播接進 CI——在此之前 CI 綠燈不代表它還活著 |
| #5 | 08-20 | `improve-openspec-ws-prefix` | 新增 `ws-` 能力前綴與雙向事件契約格式 |
| #6 | 08-20 | `add-chat-rooms` | 聊天室與成員資格；1:1 私聊的唯一性交給 DB unique index |
| #7 | 08-20 | `add-chat-messaging` | **M2**：重送去重、序號、斷線補齊——三個只在網路不可靠時才顯形的問題 |
| #8 | 08-21 | `add-message-retraction` | 撤回必須軟刪除，否則 `seq` 出現洞、補齊的客戶端分不出「被撤回」與「我漏收了」 |
| #9 | 08-21 | `add-chat-observability` | **M3**：稽核的判準是「證據會不會消失」，不是「這件事重不重要」 |
| #10 | 08-21 | `add-message-report` | 訊息檢舉 |
| #11 | 08-21 | `add-admin-moderation` | 後台檢舉審閱（八支端點） |
| #12 | 08-21 | `add-chat-retention` | 聊天資料保留策略 |
| #13 | 08-21 | `add-admin-message-removal` | 管理員移除訊息 |
| #14 | 08-21 | `add-account-suspension` | 停權時撤銷既有 WS 連線——連線層的認證只在 handshake 執行一次 |
| #15 | 08-21 | `add-ws-connection-throttle` | 連線建立後的 WS 事件不經過任何計次；做成 gateway 層 guard 而非逐 handler |
| #16 | 08-21 | `add-admin-moderation-ui` | 八個審閱端點做完後沒有任何介面在用，這支接起來 |
| #17 | 08-21 | `add-admin-member-profile` | 從「查得到人」到「查得到他做過什麼」 |
| #18 | 08-22 | `add-admin-room-overview` | 補上審閱動線最後一個斷點：點得進房間。**刻意不看訊息內容** |
| #19 | 08-22 | `add-admin-dashboard` | **M4**：後台原本什麼都查得到，但沒地方回答「現在怎麼樣」 |
| #20 | 08-22 | `fix-unauthenticated-surface` | 帳號鎖定原本是一個**沒有復原路徑的死結**；Swagger 裸奔；metrics 豁免 |
| #21 | 08-22 | `fix-presence-scan-cost` | 在線人數改用衍生 Set + `SCARD`（O(1)），不用審查報告建議的計數器 |
| #22 | 08-23 | `add-front-user-account` | **3a**：`users` 表 + 前台認證，兩側**各自的 secret**（不是共用 secret + side claim） |
| #23 | 08-23 | `migrate-chat-to-front-users` | **4**：聊天改指向 `users`；停權拆成兩支 |
| #24 | 08-23 | `add-admin-front-user-management` | **5**：解除「後台只能從檢舉找到人」的限制 |
| #25 | 08-23 | `add-front-user-registration` | **3b**：註冊 / 驗證 / 重發 / 密碼重設；未驗證不能聊天 |
| #26 | 08-28 | `fix-permission-cache-consistency` | 角色權限變更後清成員快取；`clearByMemberId` 併回 `MemberContextCachePort` |
| #27 | 08-30 | `fix-security-cleanup` | CSP 分路徑、refresh 效期、fail-open 可觀測、心跳防重入、文件漂移 |
| — | 08-31 | `fix-front-registration-gaps` | 第二輪審查的 1～5；驗證信連結、前台節流、IP 失敗計數、併發註冊、重設密碼標記已驗證 |

### 幾個反覆出現的教訓

這些是**跨 change 的觀察**，不屬於任何一支的 design.md，所以留在這裡。

- **守則都存在、都正確，只是看不到新的進入點。** M1 的肥 gateway 原本可以一路綠燈重演
  （`layering` 只 filter `*Controller.ts`、`authorization-coverage` 只掃 `adapter/in/web`）；
  `add-chat-rooms` 的 `joinGroup` IDOR 通過了當時全部 86 條守則。
  **新增一種進入點時，先問既有守則看不看得見它。**

- **註解不會失敗。** `cache-keys.ts` 寫著「不可用於請求路徑」，而 `countOnlineMembers`
  就在請求路徑上用了（#21）；`FrontLoginService` 的註解描述了一條從未接上的 IP 防線
  （第二輪審查問題 2）。**描述了不存在防線的註解比沒有註解更危險**——
  它會讓下一個人以為事情已經做完了。

- **宣告相依不等於使用它。** 限流守則第一版只看檔案有沒有提到 port，
  而重構最容易留下的殘骸正是「呼叫被移除、注入忘了清」。
  之後的守則（撤銷連線、清快取）都改成同時檢查注入**與**呼叫。

- **測試矩陣有一個形狀上的空洞：送到系統外面去的字串。**
  信件連結、302 導回目標、webhook URL 的共同特徵是**在系統內部永遠不會被呼叫**，
  所以任何「呼叫自己」的測試都驗不到。第二輪審查最嚴重的問題正好落在這裡，
  而它通過了當時 687 個測試。

- **mock 掉的東西如果正是被測行為的載體，測試就是空的。**
  e2e 的 `createMockRedis()` 的 `get` 永遠回 null，快取測試因此不修也會過（#26）。
  **寫完先把修正拿掉跑一次，紅了才算數。**

- **分表真正的教訓不是「當初做錯了」**（那個決定發生在聊天核心完成之後），
  而是**做 M2 之前沒有先問「聊天的使用者是誰」**——那個問題如果早問，
  分表會在第一天發生，而不是動到四個審閱頁、停權、WS 認證與 presence key。
