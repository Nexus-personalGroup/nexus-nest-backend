# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

（無。`add-admin-moderation` 已完成待合併。）

## 待辦

### 近期里程碑（nexus 專屬）

> Phase 1 只做即時聊天，做到 production 等級。前台另開專案，`apps/web` 為純後台管理。
> M0 骨架、M1 WS 地基已完成，見「已完成」。

- ~~**M2 聊天核心**~~：房間（`add-chat-rooms`）與訊息 + 已讀（`add-chat-messaging`）皆已完成。
  - 房間的成員資格判斷已有單一來源（`ENSURE_ROOM_MEMBERSHIP_USE_CASE`），送訊息直接複用，不要另寫一份。
- ~~**撤回／刪除訊息**~~：`add-message-retraction` 已完成。
- **附件訊息**（確定要做，不在 `add-chat-messaging` 內）：訊息帶圖片／檔案。
  之後加 `messageType` 欄位（預設 `TEXT`）即可，`content` 維持 `TEXT NOT NULL` 不需改。
  真正要先想清楚的是**前台的上傳授權與容量限制**——既有 attachment 模組是後台側的，
  那部分與訊息無關，所以它獨立成一個 change 是對的切法。
- ~~**M3 監控埋點**~~：`add-chat-observability` 已完成（Prometheus 自訂指標 + `chat_audit_log`）。
  - 檢舉入口與後台查詢已移到「進行中」。
- **M4 後台介面**：SSE 即時儀表板、使用者 360 視圖、聊天室總覽、檢舉佇列與處置。

### 待辦（近期）

- ~~**資料保留期限**~~：`add-chat-retention` 已完成稽核（180 天）與檢舉（判定後 365 天）。
- **訊息的保留策略**（`add-chat-retention` 刻意不做）：**卡在 `seq` 缺口的設計，不是卡在清理**。
  清訊息會讓 `seq` 重新出現洞，補齊的客戶端無法區分「被清掉」與「我漏收了」，
  唯一合理的反應是反覆嘗試補同一段區間——那正是訊息撤回堅持軟刪除所要避免的問題。
  **要做的話先解這個**：讓 `roomSynced` 帶「本房間最舊的可用 seq」，客戶端才分得開。
  那會動到 WS 契約與前台（獨立 repo）。另外訊息保留本身是**產品承諾**而非技術清理，
  刪掉舊對話需要產品決定與使用者告知。`retention-scope.spec.ts` 擋著誤加的清理程式碼。
- ~~**移除訊息**~~：`add-admin-message-removal` 已完成（含還原，兩者都留稽核）。
- **停用帳號**（處置動作的另一半，仍未做）：連動 `tokenVersion`（強制登出）、
  WS 連線斷開、「停權期間能不能看歷史」，每一項都要決定，實際上是獨立主題。
  **`add-admin-message-removal` 的 D1 有一個可直接沿用的教訓**：兩件事對使用者的語意不同時
  不要共用欄位——「自己登出」與「被停權」不該長得一樣。

### 已知缺口（知情，非遺漏）

- **WebSocket 沒有連線層的事件限流**：HTTP 端有全域 throttle middleware，但連線建立後的
  每個 WS 事件都是同一條 TCP 連線上的訊框，**不經過任何計次**。目前只有送訊息接了
  逐 use case 的限流（`add-chat-messaging`），`ping` / `joinRoom` / `syncRoom` 都不受限。
  正確的防線是「每條連線每秒最多 N 個事件」的傳輸層限制，而非逐個 use case 接——
  後者只會給出覆蓋完整的錯覺。`ws-rate-limit.spec.ts` 的豁免清單記錄了目前的取捨。

### 技術債（小，隨手可修）

- **布林環境變數的解析不一致**：既有變數用 `z.string().default('false').transform(v => v === 'true')`，
  它把任何非 `'true'` 的值都當成 false——`FOO=TRUE`（大寫）或 `FOO=1` 會**靜默失效**。
  `CHAT_AUDIT_ENABLED` 改用 `z.enum(['true','false'])` 讓 typo 在啟動時就失敗。
  其餘變數要不要一起換是獨立決定（換了會讓現有的 `.env` 若有大小寫問題直接啟動失敗，
  那是好事但需要有人在場處理）。

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

- **e2e 有間歇性失敗**：**已發生 4 次**，皆重跑後全綠。
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

  **下一步（尚未做）**：在 `createE2EApp` 或 supertest 呼叫端關掉 keep-alive
  （`.set('Connection', 'close')` 或 agent 設定）試試看能不能重現／消除。
  在證實之前不要改，避免用一個猜測掩蓋另一個。

  **抓到證據的方法**（前三次都因為 grep 管線而丟失）：
  先 `pnpm --filter @app/api test:e2e > /tmp/e2e.log 2>&1`，再從檔案 grep。

- **傳遞依賴漏洞（77 個）**：2026-08-20 轉 PostgreSQL 後重跑 `pnpm audit`，**數字與模板時期相同**——移除 `mysql2` 沒有減少任何一項，代表這些全都不在資料庫 driver 這條路徑上。分佈 5 low / 35 moderate / 35 high / 2 critical，多數深埋在 `apps/web > shadcn > @modelcontextprotocol/sdk` 與 `prisma` / `@nestjs/terminus` 的上游相依樹。**刻意不加 override 強制提版**——相容風險大於收益。追蹤方式：定期 `pnpm audit`，待上游更新後再評估。

### 延後功能（繼承自模板的預留）

- **帳號鎖定管理 CRUD（`add-account-lock-management`）**：後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`；前端 `/security/account-locks` 列表頁。沿用 SUPERADMIN role gate。**優先度低於 M2–M4**。

### 技術債（外部相依卡住，延後）

> **處理原則**：卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。現狀處置：api 已對齊 TS 6.0.2，`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

> 模板時期的變更歷史留在 `hexagonal-nest-express-mysql` repo，未帶入本專案。

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
