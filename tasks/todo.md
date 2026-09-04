# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

**`widen-schema-flag-scan`（#42）已完成，待 commit。**
「建 change 必帶 `--schema`」的守則只掃 `.claude/`，
而慣例來源 `openspec/project/openspec-conventions.md` 在範圍外——
**這條守則自己犯了它要防的錯**（有多份真相，只守其中一份）。
範圍擴到所有現行指示文件，封存區明確排除。

## 路線圖

**「可以直接動」的待辦已經清空。** 剩下的全落在三類：
卡外部條件（前台 repo 未開、`seq` 缺口的設計、NestJS 上游）、
需要產品或帳務決定（CI 擋合併、帳號鎖定要不要預設開啟、建群組同意權）、
以及刻意不做（UUID 探測、`domain/exception` 攤平）。

**唯一有明確下一步的是營運快照**：指標已經就位（#41），
**等它累積幾天的資料再選修法**——三條路（`users` 加 `deletedAt` 索引 /
`chat_rooms` 改成 index-only scan / 整份快照快取）代價各不相同，
而現在終於能看出哪個 count 貴。

### 已走完：2026-08-20 → 09-04，42 支 PR

M0 骨架 → M1 WebSocket 地基 → M2 訊息核心 → M3 監控 → M4 營運總覽，
接著是**分表工程**（把前台使用者從後台帳號表拆出來），
中間穿插兩輪審查報告的修補，然後是容器環境的三塊
（nginx 單一入口、e2e 進容器、關掉直連埠），
再來是後台的可讀性（Sidebar 依管理對象分組、首頁改營運摘要、權限樹中文化），
再把累積的小技術債一次清掉，然後補上兩項審查報告當初判斷「先不做」的修正，
再清掉「延後功能」裡最後一項（帳號鎖定列表），排第三輪審查並收尾它的小項，
把容器的環境變數優先序從「完全遮蔽」改成「釘死連線類、其餘吃本機」，
收掉那次驗收撈出的兩個既有缺陷（探針被 ACL 擋、e2e 吃整份 `.env`），
把待辦裡「可以直接動」的三項一次清空，
最後補上一條守則自己的掃描漏洞。
逐支見「已完成」的索引。

**第一則：那批修的都不是 bug**，是**「做到一半而且沒有東西會提醒」**
——nginx 做了但沒關舊埠、權限樹分了組但標題還是英文碼、
5 份 spec 封存了但 Purpose 留著 `TBD`。三者的解法也一致：
補完之後**加一支守則**，讓同樣的半成品不可能再累積。

**第二則：這批出現三次「測試綠但沒驗到」**（#32 → #34、#36、#37）。
形狀與判準寫在下面「幾個反覆出現的教訓」，不在這裡重複。
第三輪審查也獨立點出了同一件事，並補上這一招的**能力邊界**
（讀字面值的守則擋不住「兩邊一致地錯」）——已寫進 `openspec/project/testing.md`。

**第三則觀察來自清技術債那一支（#35）**：三條債都標著「併進下一個會動到 X 的 change」，
而那個 change 一年也不會自己出現——**「順便做」不是排程，是無限期延後**。
真要做就給它自己的 change。另外那支也示範了一件事：`pnpm build` 綠不代表 DI 組得起來，
Nest 的模組接線只有 e2e 抓得到（本專案第二次踩）。

**第三輪審查（2026-09-03，涵蓋 #28–#37）的結果本身是個訊號**：
**0 個 🔴**、兩個 🟡（一個是既有效能債、一個是設定樣板的潛伏問題），
綜合 9.0（8.1 → 8.6 → 9.0）。

更有訊息量的是審查者的方法紀錄：他提了六個「這類專案通常會踩」的假設，
**五個落空**，而每個落空的地方都留著寫清楚的理由
（`TRUST_PROXY` 為什麼是 `'1'` 不是 `true`、群組上限為什麼 200、
trgm 為什麼三字以下用不上）。**找不到問題不是因為沒找，是因為那些位置已經被想過了。**

三輪下來失敗模式明顯收斂：
「沒有東西盯著」→「以為有東西盯著」→「確實有東西盯著、只是指錯路」。

**分表工程的四支拆成四個 change 是刻意的**，那三個排序判斷值得留著
——它們是**判斷**而不是結果：

- **`fix-presence-scan-cost` 排在分表之前**：`countOnlineMembers` 用了
  明確標注「不可用於請求路徑」的 scan pattern，而分表會動到 presence key 的語意
  ——**先修乾淨再動**。
- **`add-front-user-account`（建新體系）與 `migrate-chat-to-front-users`（切換指向）
  不能合併**：前者純新增、不動既有資料，讓新體系先站著；後者才切換。
  **切換一旦開始就不能留半套狀態**，所以它自己要一次做完。
- **`add-admin-front-user-management`（後台入口）排在
  `add-front-user-registration`（註冊）之前**：分表之後後台只能從檢舉找到前台使用者，
  而開放註冊會讓帳號開始自己長出來——**缺口會在那一刻變大**，所以先補入口。

**第二輪審查（2026-08-30）的分布本身是訊號**：9 個問題有 6 個集中在
`add-front-user-registration`——那是唯一還沒經過審查的區域，舊區域一個新問題都沒有。
**change 合併後排一次審查，比累積到季末一起看划算。**

## 待辦

### 設定洩漏（✅ 已由 #40 `seal-test-env-and-exempt-infra-probes` 做掉）

> 兩件都在 `improve-container-env-precedence`（#39）的實機驗收時撈出來，
> **都不是 #39 造成的**，但形狀相同：**設定跑到不該去的地方，而失敗訊息指不到原因**。
> 三條 🔴／🟡 都做完了（最後一條由 #41 收尾）。保留內文是因為那三個判斷
> ——為什麼不認 `@Public()`、為什麼密封而非逐一關閉、為什麼不改 fail-closed
> ——之後改到同一塊時還會用到。

- ✅ **`@Public()` 擋不住 IP guard，健康檢查被 ACL 擋掉**（#40 修）。
  判準改為 `@InfraEndpoint()`——**刻意不認 `@Public()`**，因為登入端點也是
  `@Public()`，而擋惡意 IP 打登入正是黑名單存在的意義。
  實機驗過：白名單啟用且清單為空時，`/api/health` 與 `/api/metrics` 回 200、
  五個容器全 Healthy，而 `POST /api/admin/auth/login` 仍回 403。
- ✅ **e2e 會載入開發者整份 `.env`**（#40 修）。
  `applyE2EDbEnv` 改用 dotenv 的 `processEnv` 解析到暫存物件，只複製 `DB_*`。
  反向驗證：`APPLICATION_SESSION_IDLE_ENABLED=true` 之下，
  改前 **183 failed**、改後 **417 passed**。
- 🟡 順帶：`docker/api.container.env` 現在**目標是共用基準但優先序最低**
  （個人的 `.env` 會蓋掉它）。目前無實害——該檔一個有效設定都沒有，全是註解。
  已在檔頭標註，真正不可被覆寫的要寫進 compose 的 `environment:`。
- ✅ **白名單啟用後沒有恢復路徑**（#41 修）。
  啟動時若「白名單啟用 + 清單為空」記一筆 **error**，寫明後果（所有使用者流量
  被拒，含後台頁面本身）與恢復方式；另加 `pnpm --filter @app/api ip:allow <IP>`。
  ⚠️ **檢查只在啟動時跑一次**——這是設定錯誤不是執行期狀態，
  代價是執行期刪掉最後一筆不會有新日誌，這一點寫進需求了，沒有假裝涵蓋。
  fail-closed **沒有改**：空清單全鎖死是正確的姿態，缺陷在「沒徵兆、沒出口」。

### 聊天功能的下一批（前置條件已解除）

> 原本卡在分表。`migrate-chat-to-front-users`（切換指向）與
> `add-admin-front-user-management`（後台入口）都完成了，
> 以下兩項現在都可以動——真正的門檻各自寫在條目裡。

- **附件訊息**：訊息帶圖片／檔案。之後加 `messageType` 欄位（預設 `TEXT`）即可，
  `content` 維持 `TEXT NOT NULL` 不需改。**真正要先想清楚的是前台的上傳授權與容量限制**
  ——「前台使用者是誰」已由前台帳號體系與註冊流程定下來了，現在缺的只有授權規則本身：
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
- **註冊 / 驗證信箱 / 重設密碼的畫面**（後端已完成）。要接的四件事：
  1. `POST /front/auth/register` — 回 201 但**不回 token**，註冊完要自己導去登入。
  2. **`/verify-email` 這一頁必須存在**——驗證信的連結由後端接，
     驗完 302 導到 `APP_FRONT_URL/verify-email?result=success|invalid|expired`，
     前台只要讀 query 顯示三種結果。**沒有這一頁的話使用者會停在 404。**
     （連結的 base 曾經組成 `APP_FRONT_URL` 而不是後端位址，寄出去的信全是壞的，
     已由 `fix-front-registration-gaps` 修掉；現在由一支直接斷言連結字串的單元測試守著。）
  3. `POST /front/auth/forgot-password` / `reset-password`，
     重設信的連結指向前台的 `/reset-password?token=...`。
  4. ⚠️ **未驗證的帳號登得進來但聊不了天**（403 `EMAIL_NOT_VERIFIED`、WS 連線被拒）。
     登入回應帶 `emailVerified`，**要據此決定是導去聊天室還是導去「請收驗證信」**——
     不看它的話，使用者會在第一次進聊天室時撞上一個沒有說明的 403。
- **一開始就要走前台的認證端點**：聊天現在只吃 `/api/front/auth/login` 簽出的 token；
  後台 token 打前台端點會 401、開 WS 連線會被拒。

### 已知缺口（知情，非遺漏）

- **`openspec archive` 不會發現舊 Purpose 與新合併的 Requirements 互相矛盾**
  ——`api-account-suspension` 發生過。**這個要靠人看**：改動既有能力時，
  除了看 Requirements 有沒有寫對，也要回頭確認 Purpose 描述的還是同一件事。
  （「Purpose 留空或含 `TBD`」已由 `openspec-spec-format.spec.ts` 擋住，
  但守則只看得出「沒寫」，看不出「寫的跟內容不符」。）

- ⚠️ **帳號鎖定在預設部署下整組不會作動。** `APPLICATION_ACCOUNT_LOCK_ENABLED`
  預設 `false`，而登入路徑的三處（檢查鎖定 / 記錄失敗 / 寫入鎖定）全包在那個 flag 底下
  ——所以連續登入失敗**不會**鎖住任何帳號。
  `add-account-lock-management` 已讓新頁面用 `lockEnabled` 顯示停用提示，
  但**那只是讓它看得出來，不是把它打開**。
  **要不要預設開啟是一個沒有人做過的決定**：開了會有「使用者自己把自己鎖在外面」
  的支援成本（時效預設 15 分鐘、門檻 3 次），不開則暴力破解只有 IP 層擋著。
  同一個問題也適用其他 `APPLICATION_*_ENABLED`——它們預設都是 false。

- **第二輪審查（2026-08-30）刻意不做的三項**（原本四項，`listUsers` 全表掃描已由 `fix-review-deferred-items` 修掉）：
  - **reCAPTCHA 沒有接上前台**（問題 3 的一半）。port 與 adapter 都已存在（後台登入在用），
    技術上不難。不做的理由是**它需要前台配合**——前台要嵌 widget、處理 token，
    而前台是還沒開始的獨立 repo。等前台開工時一起做，那時能真的端到端驗一次。
  - **建群組可以把任何人拉進來，對方沒有同意權**（問題 8）。這是**產品決策不是 bug**：
    未經同意的群組邀請是已知的騷擾管道（建群、發言、退群，受害者只能事後檢舉）。
    值得在路線圖占一格，例如「新成員在對方首次發言前只看得到房間存在」或最小可行的封鎖名單。
  - **`MemberNotFoundException` 讓建群組成為 UUID 探測器**（問題 9）：整批失敗的設計是對的
    （略過不合格者會讓呼叫端以為所有人都加入了），代價是可以逐一驗證 UUID。
    UUID 不可猜測，只有在 ID 從別處洩漏時才有意義——**記錄下來，不建議為此改設計**。

（其餘無。連線層事件限流已補上；第一輪審查報告的 🔴 由 `fix-unauthenticated-surface`
修掉、🟡🟢 由 `fix-security-cleanup` 收完；第二輪的問題 1～5 是 `fix-front-registration-gaps`。）

### 技術債（小，隨手可修）

- ✅ **master spec 的 `--strict` 7 支紅**（#41 修）。根因不是漏寫 SHALL/MUST——
  **openspec 的 validator 只讀 requirement 內文的第一行**，而本專案排版在 80 字
  左右斷行，關鍵字掉到第二行就等於沒寫（`MAY` 也不算）。
  七條改成開頭第一行就表態；守則加進 `openspec-spec-format.spec.ts`，
  `verify:ci` 另加一步 `openspec validate --specs --strict` 當廣撒的網。
- 🟡 **營運快照每 5 秒跑兩個無界 `COUNT(*)`**（第三輪審查問題 1）。
  **觀測已於 #41 就位**：`dashboard_query_seconds` 直方圖，標籤是五個查詢名，
  所以看得出是哪一個貴——不是只有總耗時。
  ⚠️ **下一步是看數據，不是挑方案。** 三條路（`users` 加 `deletedAt` 索引 /
  `chat_rooms` 加 `createdAt` 讓它 index-only scan / 整份快照快取 30 秒）
  代價各不相同，而審查報告點名 `countRooms` / `countUsers` 是**靜態推論**
  （「沒有 WHERE」「沒有索引」），不是量出來的。
  觸發面在 #30 之後擴大了：首頁也打同一支，而首頁是登入後的落點。
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

- **CI 仍然擋不住合併**（已選路徑 (c)，缺口縮小但沒有消失）。
  branch protection 與 ruleset 在 **Free 方案的私有 organization repo** 上都回 403
  （`Upgrade to GitHub Pro or make this repository public`），2026-08-20 與 09-02 各實測一次。

  **已做**：`.husky/pre-push` 跑完整驗證鏈（typecheck + lint + test:cov），
  且**進版控**，換機器 `pnpm install` 就會裝上。

  **仍然擋不住的**：`git push --no-verify`，以及在 GitHub 網頁上直接按 merge。
  **所以 `platform-ci-quality-gate` 的保證仍然只有「job 相依」那一半成立**
  （`build` needs `quality`），人為 merge 的那一半不成立。

  要真正擋住只剩兩條：(a) repo 改 public（免費、立即可用，但程式碼與內部審查報告全公開）；
  (b) 升級 GitHub Team。**這是知情的缺口，不是忘記設定。**

- **Docker build cache 不會自己清到夠小**：`~/.orbstack/config/docker.json` 是空的 `{}`，
  走 Docker 預設門檻——實測長到 19GB 才開始清，2026-09-02 再量已達 **21.8GB（19GB 可回收）**。
  **這是機器設定不是 repo 設定**，repo 只能提供 `pnpm docker:prune` 手動清。
  要它自己清就在那份檔案設
  `{"builder":{"gc":{"enabled":true,"defaultKeepStorage":"5GB"}}}` 後重啟 OrbStack。

> **env 檔的協作方式**：`apps/api/.env` 與 `.env.example` 在 AI 的權限設定中被拒絕存取。
> 需要改動時由 AI 產生 `apps/api/env` / `env.example`（無點，可寫入），使用者複製過去後刪除暫存檔。
> **`.gitignore` 只擋 `.env*`，沒有點的 `env` 不在名單內**——暫存的 `env` 含真實金鑰，複製完務必刪掉。

### 觀察中

- **e2e 有間歇性失敗**：**已發生 9 次，每次重跑都全綠，至今無法重現。**

  逐次的完整紀錄（錯誤訊息、當時在跑什麼、做過的受控實驗）留在 git 歷史裡
  ——這裡只留**目前的判斷狀態**，因為那才是下次發生時要用的東西。

  | 次 | 日期 | 症狀 | 它推翻了什麼 |
  | --- | --- | --- | --- |
  | 1–3 | 08-20~21 | 只記得測試名稱 | 證據因為 grep 管線而丟失 |
  | 4 | 08-21 | `read ECONNRESET` | 推翻「ts-jest 快取 / 檔案 mtime」 |
  | 5 | 08-21 | 同上，但**單獨一個 POST** | 推翻「同端點連續兩次的競態」 |
  | 6 | 08-21 | 3 支失敗，**回應內容不對**（401 / 無 data / 404） | 推翻「一定是連線層錯誤」 |
  | 7 | 08-22 | `beforeEach` 逾時，`resetDb` 跑不完 5 秒 | 第三種症狀；累積出「跟在 `test:cov` 後面」的共同點 |
  | 8 | 08-28 | 同第 6 次（登入回應無 `data`） | **推翻「跟在 test:cov 後面」**——這次是單獨的 `test:e2e` |
  | 9 | 09-03 | `role.e2e-spec.ts` 的 `beforeEach` 登入拿不到 `data` | **首次抓到底層原因：登入回的是 `401`**，不是回應格式壞掉 |
  | 10 | 09-03 | `front-registration.e2e-spec.ts` 單一測試 `read ECONNRESET` | **削弱「`.env` 洩漏」的解釋**——它發生在密封之後 |
  | 11 | 09-03 | `chat-report.e2e-spec.ts` 單一測試 `read ECONNRESET` | 同日第二次，**同樣在密封之後**——`.env` 的解釋可以放棄了 |

  **第 9 次是第一次留下有用的證據**（前幾次只記到「無 `data`」這個表象）：

  - `data` 是 `undefined` **因為登入本身失敗了**——日誌裡有
    `POST /api/admin/auth/login → 401`，不是連線層錯誤也不是回應被截斷。
  - 同一秒前一筆是 `GET /api/front/auth/verify-email → 429`（節流測試的正常輸出）。
  - **同一條指令連跑兩次：第一次 1 支紅、第二次 417 全過。**
  - 這次是 `pnpm verify:ci`（tmpfs 資料庫），不是 host 的 `test:e2e`——
    **推翻「只發生在某一種跑法」**。
  - 完整日誌已存檔（scratchpad `e2e-flake-09.log`），下次比對用。

  **401 把範圍縮小了很多**：先前的假設多半繞著連線層與回應形狀打轉，
  而 401 代表請求有到、有被處理、認證判定為失敗。
  `--runInBand` 所以不是平行干擾。下次發生時要抓的是**那次登入的 auth log**
  （`APPLICATION_AUTH_LOG_ENABLED=true` 時會寫進 DB），那會說出是密碼不符還是查無帳號。

  ⚠️ **2026-09-03 訂正：「帳號鎖定預設關閉，所以不是被鎖」這句推論是錯的。**
  當天發現 **e2e 會載入開發者整份 `apps/api/.env`**（見「待辦 → 設定洩漏」），
  所以 envSchema 的預設值**在有 `.env` 的機器上根本不適用**。
  而該機器的 `.env` 目前正是 `APPLICATION_ACCOUNT_LOCK_ENABLED=true`。

  **由此得到一個以前不存在的假設**（未證實，下次發生時先驗這個）：
  帳號鎖定開著 → e2e 裡故意打錯密碼的測試把帳號鎖了 → 後續登入回 401。
  它能解釋「看起來間歇」——鎖定狀態跨 run 留在 DB 裡、又會隨時間自動解除，
  而旗標本身是**沒進版控的個人設定**，所以同一份程式碼在不同時間點行為不同。
  ⚠️ **但這只是假設**：第 9 次的症狀是**登入本身回 401**，
  而 09-03 那次 183 紅的症狀是**登入回 200、之後才 401**（`SessionIdleGuard`），
  兩者形狀不同，**不能宣稱破案**。
  驗法很便宜：發生時記下 `.env` 的旗標狀態，並查 `account_locks` 表有無該帳號。

  **第 9 次發生在 `pnpm verify:ci`，而它是「host 跑測試 + 容器只提供 tmpfs 資料庫」**
  （`verify-ci.sh` 只覆寫 `DB_*`），所以它**當時同樣吃得到 `.env` 的旗標**。

  ⚠️ **但第 10、11 次都發生在密封改完之後**——`.env` 的旗標已經進不來了，
  同一天還是各紅了一次（都是 `read ECONNRESET`、不同 spec、重跑即全綠）。
  所以「`.env` 洩漏造成間歇性失敗」這個假設**可以放棄了**。
  第 4、5 次同樣是 `ECONNRESET`，那一支的形狀（連線層被重置）
  從頭到尾都不是設定問題。
  **兩件事要分開看**：`.env` 洩漏是**確定的、可重現的**缺陷（已修，見 #40）；
  這條間歇性失敗**仍然沒有解釋**，計數 11。

  **一天內抽中兩次是新資訊**——先前平均約兩天一次。若接下來密集出現，
  最值得先驗的仍是 2026-08-21 記下但沒動的那個推測：
  `createE2EApp` 不呼叫 `listen()`，supertest 每個請求自己 `listen(0)` 再 `close()`，
  在 CPU 壓力下那個窗口會變寬。**當時沒有證據所以沒改**，現在也還沒有。

  **目前確定的只有三件事**：
  (a) 三種症狀（連線層錯誤 / 回應內容不對 / DB 操作變慢）都指向**環境**而非測試邏輯；
  (b) **單獨跑該 spec 從來沒失敗過**，只在完整套件跑時出現；
  (c) 第 8 次做了對照——**stash 掉改動 384/384 綠、還原後同樣的碼 388/388 綠**，
  排除了「某次改動造成」。

  **每一個假設都被後續的發生推翻過。** 2026-08-21 查過一輪（15 次受控執行，0 次重現），
  注意到 `createE2EApp` 用 `forceCloseConnections: true` 且**不呼叫 `listen()`**
  （supertest 會自己 `listen(0)` 再 `close()`，每個請求一輪），推測是那個競態在
  CPU 壓力下窗口變寬——**但沒有證據，因此沒有改**。
  可以順手把它改成只 `listen()` 一次讓問題「可能」消失，
  但那是用一個猜測掩蓋另一個，而這個問題已經被錯誤假設誤導四次了。

  **下次發生時要做的**（前三次都因為 grep 管線丟失證據）：
  先 `pnpm --filter @app/api test:e2e > /tmp/e2e.log 2>&1` 再從檔案 grep，
  並記下當下還有什麼在跑、以及 `--detectOpenHandles` 的輸出。

  **現況**：第 9 次發生在 09-03 的 `pnpm verify:ci`（見上表），重跑即全綠。
  CI 的 E2E 從 #29 起連續九支一次過——**但本機已經抽中兩次**，
  所以「CI 都過」不代表它變少了，只代表 CI 的執行環境比較不容易觸發。
  **安靜不等於修好了**——中間沒有任何針對它的改動，所以這段空窗只是還沒再抽中，
  不是證據。條目保留，**計數 11**。

  ⚠️ **本機的 e2e 全紅不要記進這裡**：#35 / #36 各有一次本機 409 全紅、
  #39 有一次 183 紅，但三次都有明確原因且百分之百重現
  （Nest re-export、模組接線、`.env` 的 `SESSION_IDLE` 旗標漏進 e2e）。
  把有原因的失敗混進這條追蹤紀錄，會讓「無法重現」這個關鍵特徵失焦。
  **判準是「重跑會不會綠」**：重跑即綠 → 記這裡；重跑照樣紅 → 有原因，去查。

- **傳遞依賴漏洞（77 個）**：2026-08-20 轉 PostgreSQL 後重跑 `pnpm audit`，**數字與模板時期相同**——移除 `mysql2` 沒有減少任何一項，代表這些全都不在資料庫 driver 這條路徑上。分佈 5 low / 35 moderate / 35 high / 2 critical，多數深埋在 `apps/web > shadcn > @modelcontextprotocol/sdk` 與 `prisma` / `@nestjs/terminus` 的上游相依樹。**刻意不加 override 強制提版**——相容風險大於收益。追蹤方式：定期 `pnpm audit`，待上游更新後再評估。

### 延後功能（繼承自模板的預留）

**清空。** 最後一項（帳號鎖定管理）已由 `add-account-lock-management` 完成，
**範圍刻意小於原記載**：沒做 `POST` 手動鎖定（跟停用帳號重複且語意錯——會自動到期）
與 `DELETE` 解鎖（跟既有的 `POST unlock-account` 是同一個動作）。
理由見該 change 的 design D1 / D2，**不是做漏了**。

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
| #22 | 08-23 | `add-front-user-account` | 分表①：`users` 表 + 前台認證，兩側**各自的 secret**（不是共用 secret + side claim） |
| #23 | 08-23 | `migrate-chat-to-front-users` | 分表②：聊天改指向 `users`；停權拆成兩支 |
| #24 | 08-23 | `add-admin-front-user-management` | 分表③：解除「後台只能從檢舉找到人」的限制 |
| #25 | 08-23 | `add-front-user-registration` | 分表④：註冊 / 驗證 / 重發 / 密碼重設；未驗證不能聊天 |
| #26 | 08-28 | `fix-permission-cache-consistency` | 角色權限變更後清成員快取；`clearByMemberId` 併回 `MemberContextCachePort` |
| #27 | 08-30 | `fix-security-cleanup` | CSP 分路徑、refresh 效期、fail-open 可觀測、心跳防重入、文件漂移 |
| #28 | 08-31 | `fix-front-registration-gaps` | 第二輪審查的 1～5；驗證信連結、前台節流、IP 失敗計數、併發註冊、重設密碼標記已驗證 |
| #29 | 09-01 | `add-nginx-proxy-and-containerised-e2e` | nginx 單一入口 + `TRUST_PROXY`；e2e 的測試行程進容器；修掉 `down -v` 會清光開發環境的既有 bug |
| #30 | 09-01 | `improve-admin-orientation` | Sidebar 依「管理誰」分組；首頁從佔位頁改成營運摘要。**捷徑卡做到一半砍掉**——sidebar 常駐，再列一次是純重複 |
| #31 | 09-02 | `enforce-single-entry-container` | 關掉 api / web 的對外埠，容器模式只剩 nginx。**推翻 #29 剛寫進 spec 的「對外埠 MUST 保留」** |
| #32 | 09-02 | `improve-permission-tree-legibility` | 權限樹群組標題中文化；安全管理顯示為不可指派（維持 `@Roles(SUPERADMIN)` 不下放）；把「列內隱藏／頁面級 disabled」寫成明文 |
| #33 | 09-02 | `fix-spec-purpose-and-permission-naming` | 補完 5 份 `TBD` Purpose 並加守則；`MODERATION:VIEW` 改名反映它涵蓋三個頁面（EDIT **刻意不對稱**） |
| #34 | 09-02 | `fix-unassignable-permission-display` | **#32 的修正**：安全管理改為純說明列表。恆為未勾的方框對超級管理者是假的，而「SUPERADMIN 時顯示已勾」也修不掉「同一個圖示兩種語意」 |
| #35 | 09-02 | `improve-startup-signals-and-module-boundaries` | 清三條技術債：api healthcheck（`--wait` 不再在編譯中回報成功）、布林 env 改 `z.enum`、抽出 `EventPublisherModule` / `SessionRevocationModule` 讓 admin 側不再相依連線層 |
| #36 | 09-02 | `fix-review-deferred-items` | 推翻兩個「刻意不做」：WS 連線上限的 TOCTOU 改成寫入後回讀 + 決定性排名；`users` 加 `pg_trgm` GIN 索引（語意不變）。**三支測試第一版都是假的**，見 lessons |
| #37 | 09-03 | `add-account-lock-management` | 帳號鎖定列表頁。範圍**刻意小於** todo 記載（不做手動鎖定與第二支解鎖端點）；驗收時才發現鎖定功能預設關閉，回應因此帶 `lockEnabled` |
| #38 | 09-03 | `fix-review-followup-cleanup` | 第三輪審查的六個小項；nginx 改條件式 upgrade（潛伏問題，加 keepalive 才會咬人）；`verify-ci.sh` 改問 `docker compose port` 而非自己組埠 |
| #39 | 09-03 | `improve-container-env-precedence` | 容器改吃本機 `apps/api/.env`，連線類在 compose 釘死 + 守則；順帶修掉 `API_BASE_URL` 指向已關閉埠的潛伏 bug；驗收撈出兩個既有問題（`@Public()` 擋不住 IP guard、e2e 吃整份 `.env`） |
| #40 | 09-03 | `seal-test-env-and-exempt-infra-probes` | 基礎設施探針（health / metrics）豁免於 IP ACL——判準是 `@InfraEndpoint()` 而非 `@Public()`（登入端點也是 `@Public()`）；e2e 只取 `DB_*`，不再整份載入開發者的 `.env` |
| #41 | 09-03 | `fix-todo-backlog-cleanup` | 營運快照逐查詢的耗時指標（只加觀測、不改索引）；七支 master spec 改成第一行就表態 + 守則（validator 只讀第一行）；IP 白名單空清單的啟動 error 與 `ip:allow` 恢復指令 |
| #42 | 09-04 | `widen-schema-flag-scan` | 「建 change 必帶 `--schema`」的掃描範圍從 `.claude/` 擴到所有現行指示文件，封存區明確排除；掃整個 `openspec/` 是為了讓那條排除**承重**而不是死程式碼 |

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

- **測試綠不等於驗到了——已經三種形狀，每一種都是「建構的狀態不是規則要處理的狀態」。**
  - **mock 掉了被測行為的載體**：`createMockRedis()` 的 `get` 永遠回 null，
    快取測試因此不修也會過（#26）。
  - **只走了一種資料**：權限樹的方框在「新增角色」（空資料）下看起來完全正常，
    錯誤只在「檢視既有角色」時顯形（#32 → #34）。
  - **循序呼叫驗不到交錯**：連線上限的競態測試全是 `await A; await B;`，
    而 TOCTOU 是兩條都先寫入才各自回讀——那個中間狀態走完整流程根本碰不到（#36）。
  - **驗了資料怎麼呈現，沒驗資料怎麼產生**：帳號鎖定列表的測試全部正確，
    但沒有一支問「`lockedAt` 從哪來」——而它來自一個預設關閉的 feature flag，
    於是那一頁在預設部署下永遠是空的（#37）。**這一種測試本身沒有錯，錯的是前提。**
  **共同判準：挑得出「哪一種輸入會讓我寫的那段邏輯變成錯的」，才算真的驗到。**
  前三種靠選對輸入；第四種靠**實機跑一次完整流程**——那是唯一會撞到假前提的地方。
  做法一律是**寫完先把修正拿掉跑一次，紅了才算數**——而且要確認紅的是自己那一支。

- **分表真正的教訓不是「當初做錯了」**（那個決定發生在聊天核心完成之後），
  而是**做 M2 之前沒有先問「聊天的使用者是誰」**——那個問題如果早問，
  分表會在第一天發生，而不是動到四個審閱頁、停權、WS 認證與 presence key。
