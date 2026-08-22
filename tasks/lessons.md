# Lessons 踩坑紀錄

> 只記**踩過的坑**：非顯而易見、有具體現象與根因、下次還會再踩的。新 session 開工前先讀；被糾正或踩到坑時立即記錄。

## 撰寫格式

**三類東西不屬於這裡**，寫進來只會稀釋真正重要的內容：

| 不收 | 該去哪 |
| --- | --- |
| 官方文件查得到的基本知識 | 刪掉（如「改 schema 後要 `prisma generate`」） |
| 專案慣例與架構決策 | `openspec/project.md`（**先搬再刪**，不要弄丟資訊） |
| 已被護欄自動擋住的 | 刪掉——機器在守就不需要人記得 |

**條目累積後要定期回頭整理**，不是只增不減：2026-08-14 一次整理從 102 條降到 69 條，砍掉的全是上表三類。沒整理的 lessons 會變成沒人讀的雜訊。

**依主題分組**（Prisma / JWT / NestJS…）而非日期流水——同主題聚在一起才找得到。

每條 lesson 都要涵蓋三件事：**踩到什麼**（現象 / 錯誤訊息 / 做錯了什麼）、**Why**（根因：哪個工具的哪個行為造成）、**How to apply**（下次怎麼避免 / 怎麼套用）。依複雜度選格式：

**短規則**（一兩句話講得完）維持單行 bullet：

```markdown
- **規則**：機制 + 套用方式。
```

**複雜教訓**（有具體現象、需要解釋根因）用三段式，標題帶日期：

```markdown
### YYYY-MM-DD — 一句話標題

**踩到什麼**：現象 / 錯誤訊息 / 做錯了什麼。

**Why**：根因 — 哪個工具的哪個行為、哪個慣例造成。

**How to apply**：下次遇到怎麼避免。
```

判準：**寫出來超過三行就改用三段式**。長 bullet 塞五百字讀不動，也找不到重點。

## 工作流程 / 驗證方法

### 2026-08-14 — 「設定寫了但沒有執行路徑」是本專案最常見的缺陷型態

**踩到什麼**：一輪稽核抓到**七個**同型問題——`eslint.config.mjs` 的 `test/**` 區塊不在 lint glob 內、PostToolUse hook 跑的 `npx tsc` 在 root 根本跑不起來、CI 完全不跑 test/lint/typecheck、四個覆蓋率門檻沒有任何指令帶 `--coverage`、兩個 `.js` 設定檔不在任何檢查範圍、`gen:module` 產出物不符合新護欄、`overrides` 宣告在 pnpm 根本不讀的位置。

**Why**：加設定的當下只想「規則內容對不對」，沒問「哪個指令會執行它」。這類缺陷**沒有任何工具會警告**，而且「看起來有保護」比完全沒有保護更危險——它讓人停止懷疑。

**How to apply**：新增任何門檻 / 規則 / hook 時，明確寫出「哪個指令、哪個 job 會執行它」，並**插探針驗證它真的會失敗**。審查既有設定時，優先查執行路徑而非設定內容。三個高頻盲區：`.js` 設定檔（tsc 不掃、lint glob 常漏）、產生器產出物（架構測試掃不到「還沒產生的程式碼」）、文件裡的路徑與指令（重構後無人通知）。

### 2026-08-14 — 反向驗證的還原步驟本身也要驗證

**踩到什麼**：插探針驗證規則會不會紅，之後用 `cp backup.js target.js` 還原，指令跑完顯示 `overwrite? (y/n [n]) not overwritten`——**檔案根本沒還原**，是後續跑測試才發現。

**Why**：多數環境把 `cp` alias 成 `cp -i`，非互動情境下互動提示會靜默變成「不覆寫」。

**How to apply**：還原一律用 python 字串替換或 `git checkout --`，還原後**實際驗證**（跑一次該檔的載入或測試）。反向驗證的完整循環是「插探針 → 親眼看它紅 → 還原 → **確認 `git status` 乾淨**」，最後一步不能省。

### 2026-08-16 — 「測試全綠」不等於「改動被驗證過」，要先確認有測試載入那段程式碼

**踩到什麼**：驗證 path alias 可行性時，把一支檔案的 import 改成 `@app/*`，跑 `pnpm test` 得到 234 全綠，一度判定「ts-jest 開箱支援 alias」。實際上**沒有任何單元測試會載入那支檔案**——另寫一支探針 spec 直接 import 它，才看到 ts-jest 根本解析不了 `@app/*`，需要 `moduleNameMapper`。

**Why**：測試套件的綠燈只覆蓋「被執行到的程式碼」。改動落在測試沒觸及的檔案時，全綠是**無資訊**而非正面證據，但它在心理上和真正的驗證完全一樣，會直接中止追查。

**How to apply**：驗證某個機制可不可行時，不要用「跑既有測試看有沒有紅」當判準——**寫一支直接觸發該機制的探針**，看它由紅轉綠。判斷既有測試有沒有覆蓋到，最快的方式是把改動處故意改壞，若測試仍全綠就代表沒人載入它。

- **用 grep 判斷「還有沒有人在用」會漏多行寫法**：移除 `TestAppOverrides.prisma` 前用 `grep "createE2EApp({" | grep prisma` 判定「0 處在用」，實際上 `serve-static.e2e-spec.ts` 是多行寫法（`createE2EApp({\n  prisma: …`），grep 抓不到，最後是 typecheck 攔下的。作法：判斷「是否還有呼叫端」時，**優先移除後跑 typecheck**（編譯器天生跨行），grep 只當快速預覽；真要用 grep 就搭配 `-A3` 或直接搜屬性名而非整個呼叫式。

- **文件裡的路徑與指令要用機器驗證**：重構改了目錄或 script 名，文件不會有任何工具通知。作法：(1) regex 抓出文件所有 `` `apps/**` `` 路徑逐一 `exists()`；(2) 抓出提到的 `pnpm` script 逐一比對 `package.json`。一次就抓出 4 處過時（含存在一個月的 Swagger 網址）。
- **JSDoc 裡不要寫含 `*/` 的 glob**（如 `test/**/*`）：`*/` 提前終止註解，整個檔案語法爆掉；若在 `.js` 設定檔更致命——`typecheck`／`lint` 都不掃，只有實際執行才炸。
- **regex 的 `\s` 包含換行**：`/^(\s*)ANCHOR$/m` 的 `^` 可能匹配到前一空行行首，`\s*` 跨行吃掉換行，`$1` 就夾帶了換行。只想抓行首縮排時用 `[ \t]*`。
- **完成當下就更新 `todo.md`**：曾有兩條安全待辦早已實作完成卻掛著近一個月，讓人誤判專案現況。收尾時**先 grep 原始碼再更新**，不要憑印象。

- **「能動」有兩種：設計出來的，與兩個獨立決定湊巧一致的**：整合測試沒宣告 Redis 連線，本機靠 `.env` 的 6389、CI 靠 `envSchema` 預設的 6379——後者剛好等於 service container 的埠。兩個值沒有任何關聯，改動任一方就會以「連不到服務」的形式失敗，而症狀指不到原因。這是「設定寫了但沒有執行路徑」的鏡像：**執行路徑存在，但它成立的理由是巧合**。檢查方式：對每個外部相依問「這個值為什麼會對？」——答不出因果就補明示宣告。

### 2026-08-16 — 改動的「接縫」比功能內部更容易出事，尤其是向後相容那一行

**踩到什麼**：把 token 黑名單從 boolean 改成 reason 時，adapter 對舊格式的值回 `null`。註解寫「舊格式當成非遭竊處理」——方向對，但 `null` 在呼叫端的語意是「不在黑名單」，於是連拒絕都跳過，既存的已登出 token 全部復活。同一輪還有三個同型問題：fail-closed 的決定沒傳達到文件、compose 合併沒帶到 `docker/` 的註解、`.dockerignore` 與守則測試各自合理卻相衝。

**Why**：每個決定**單獨看都是對的**，錯在交界處沒有人負責。而且這類問題 CI 全綠——上層邏輯的測試涵蓋不到翻譯層的語意錯誤（service 收到任何 truthy 值都會正確拒絕，問題是 adapter 根本沒給它 truthy 值）。

**How to apply**：(1) 改變某個回傳型別的語意時，**逐一列出所有可能值與呼叫端的解讀**，特別注意「查無資料」與「有資料但無法解析」是否被壓成同一個值；(2) 向後相容的分支**必須有測試**，而且測試要下在**做翻譯的那一層**，不是上層；(3) 改了某個決定（fail-open → fail-closed、合併檔案、改名）後，搜尋所有描述舊行為的文件與註解——它們不會有任何工具提醒。

### 2026-08-16 — 「檢查應存在而不存在」的規則最難想到，卻擋得住最嚴重的問題

**踩到什麼**：`AttachmentController` 兩支端點一個授權裝飾器都沒有，任何已登入者可刪任何人的附件。它**通過了當時全部 18 支守則、260 支單元測試與 e2e**——因為每一條既有規則它都遵守，只是少了沒有規則要求它有的東西。三輪審查都沒掃到，因為前兩輪的授權檢查對象都是「有標註的 controller」。

**Why**：既有守則驗證的是「**有標的標對了**」，漏洞出在「**該標的標了沒**」——檢查方向是反的。全域 guard「沒標註就放行」的設計本身正確（讓全域註冊不影響未標註路由），但它的前提是「該標的都標了」，而沒有任何東西在守這個前提。

**How to apply**：寫守則時除了問「這條規則怎麼寫」，要多問一句「**什麼東西的缺席才是問題**」。這類 negative-space 規則的判準通常很簡單（本例：收 `@Param` 且非 `@Public` 就必須有授權裝飾器），難的是意識到要寫。新增 controller、新增需要授權的端點時，在補守則之前這是 review 必須人工確認的項目。

### 2026-08-17 — 字串比對型的守則必須先去註解，否則說明文字會把規則餵飽

**踩到什麼**：`authorization-coverage.spec.ts` 用 `classHeader.includes('@Roles(')` 判斷 class 有沒有授權裝飾器，而 `classHeader` 取的是 `export class` 之前的全部內容——**包含檔頭 TSDoc**。`SecurityController` 的註解寫著「刻意用 RolesGuard + @Roles(SUPERADMIN) 粗粒度 role gate」，於是實測把真的 `@Roles` 裝飾器刪掉、只留註解，守則照樣 61 全綠。

**Why**：靜態掃描把註解與程式碼一視同仁。而**說明某個裝飾器**的註解，恰好最常出現在「有那個裝飾器」的檔案裡——偽陰性因此特別容易發生在「本來就正確」的地方，等到有人重構移除裝飾器（先改 code、註解晚點再說）才顯形，且不會有任何徵兆。

**How to apply**：任何用字串比對找裝飾器 / 關鍵字的守則，比對前一律 `stripComments`。判斷 class 層級時再進一步只取 `@Controller(` 到 `export class` 之間——那段不可能夾註解。另外兩個同批踩到的切割錯誤：(1) handler 切塊要**往前**吃掉連續的裝飾器行，否則寫在 `@Post()` 上方的 `@Public()` 會被歸給前一個 handler，造成前一支漏報、本支誤報；(2) 守則本身要有**合成輸入的自我測試**——守則出錯是靜默的，而給偽陰性的守則比沒有守則更危險，它會讓人停止人工檢查。

- **新守則在還沒有真實樣本時，「掃描有效性」不能硬性要求 `> 0`**：其他規則都用 `expect(checked).toBeGreaterThan(0)` 防止空轉，但一條為了**未來**的能力而寫的規則（如 `ws-*` 的事件格式檢查，寫在第一支 `ws-` spec 出現之前）套用同樣寫法會一直是紅的。改成「有該類能力時才要求掃到」，並用**合成輸入的自我測試**承擔正確性——那是它唯一的安全網。收尾時再造一個臨時 spec 做反向驗證（確認真的會紅、補齊會綠、刪掉後 `git status` 乾淨），否則規則是否空轉要等幾個月後才知道。

### 2026-08-20 — 描述規則的 spec 會被自己的規則抓出來

**踩到什麼**：新增「`ws-*` 不得使用 `**Success Response**`」的守則後，封存時把該規則寫進 `platform-engineering-guardrails` 的 spec，守則立刻紅——**被抓出來的正是那份描述規則的 spec**。因為它的 scenario 寫著「WHEN `ws-*` 的 spec 出現 `**Success Response**`」，而判斷式是 `body.includes('**Success Response**')`。

**Why**：與 `authorization-coverage` 踩過的註解冒充裝飾器**同型但不同處**——那次是註解，這次是**規則自身的文件**。而且這個缺陷早就存在（`includes` 一直是這樣寫的），只是先前沒有任何 spec 提到過那個字串，所以從未觸發。**規則越是被完整記載，越容易踩到自己。**

**How to apply**：字串比對要能區分「使用」與「提及」。Markdown 的區塊標籤在**實際使用時一律在行首**（`**Success Response** \`200 OK\`：`），在行文中提及則是夾在句子裡的行內程式碼。改用 `/^\s*<escaped>/m` 判斷即可分開兩者。凡是「規則本身會被寫進 spec / 文件」的檢查，都要先問一句：**這條規則描述自己的時候會不會違反自己？**

### 2026-08-20 — openspec 的 MODIFIED 靠「標題字串」比對，改標題會讓封存整個中止

**踩到什麼**：delta spec 用 `## MODIFIED Requirements`，把需求標題從「品質檢查必須在 Merge Request 階段執行」改成「…Pull Request…」，內容也一併更新。`openspec validate` **通過**，但 `openspec archive` 失敗：

```
platform-ci-quality-gate MODIFIED failed for header "### Requirement: 品質檢查必須在 Pull Request 階段執行" - not found
Aborted. No files were changed.
```

**Why**：MODIFIED 是拿 delta 的 `### Requirement:` 標題去 master spec 裡找同名那塊來取代。標題一改就找不到目標。而 `validate` 只檢查 delta 自身的格式合不合法，**不會拿去跟 master spec 對照**——所以「validate 綠 + archive 紅」是這個工具的正常行為，不是壞掉。

**How to apply**：需求要改名就用 `## RENAMED Requirements`（`- FROM:` / `- TO:` 各一行，值是完整的 `### Requirement: <名稱>`）。改名**又**改內容時兩段都要寫，MODIFIED 那段用**改名後**的標題。archive 輸出會顯示 `→ 1 renamed` 確認生效。順帶注意改名後的需求會被移到 master spec 的**末尾**，不留在原位置。

**還好的一點**：archive 失敗時是 `Aborted. No files were changed.`——它不會做到一半留下半套的 master spec。

## WebSocket / 多實例

### 2026-08-20 — `NestFactory.create()` 不會跑 `onModuleInit`，而 WS adapter 必須在 init 之前掛上

**踩到什麼**：`RedisIoAdapter` 從 DI 取 `RedisService` 來建 pub/sub 連線，結果拋 `Redis 尚未初始化`。而且 `main.ts` 有一模一樣的問題，只是還沒人啟動過 dev server 所以沒發現——單元測試與 e2e 都驗不到（e2e 把 Redis mock 掉、也不掛 adapter）。

**Why**：`NestFactory.create()` 只建立容器，`onModuleInit` 要等 `app.init()`（由 `app.listen()` 觸發）才跑。但 **WebSocket gateway 在 `init` 階段就綁定 adapter**，所以「先 init 再掛 adapter」也不成立——那時已經來不及。兩個時機互相矛盾。

**How to apply**：需要在 `listen()` 之前使用的資源，**不能相依任何 NestJS 生命週期 hook**。把連線建立抽成獨立工廠（`createRedisClient`），`RedisService` 與 adapter 各自呼叫；設定仍集中一份，但誰都不等誰。順帶一提，這個 bug 是被兩實例整合測試抓到的——它是唯一會走完整 bootstrap 流程的測試。

### 2026-08-20 — 關閉 HTTP server **不等於** `kill -9`，disconnect handler 照樣會跑

**踩到什麼**：整合測試想驗「實例死亡後 presence 自動回收」，用「關掉第三個實例的 HTTP server」模擬。結果連線數在 kill 後**立刻**歸零，根本沒經過陳舊判定那條路徑——而測試是綠的。

**Why**：關閉 server 會斷開連線，Socket.IO 因此觸發 disconnect 事件，而該實例的 app 還活著，`handleDisconnect` 照常執行並清乾淨 presence。真正的行程死亡是「什麼都不會發生」，兩者差很多。同理，同 process 內的計時器也不會停，會繼續替死掉的連線續期。

**How to apply**：要驗證「無人清理時能否自動回收」，就**直接寫入一筆沒有任何人會續期的紀錄**，別用關閉實例來模擬。單一 process 內無法忠實重現行程死亡，硬做只會得到一個看似綠燈實則沒測到東西的測試。

- **同一 process 起多實例時，`INSTANCE_ID` 不能是 module 層級常數**：module 在 process 內共用，兩個實例會自稱同一個 ID，presence 把兩條連線算成一條。改成 DI provider（`useFactory: () => randomUUID()`）——正式環境一個 process 一個實例，兩種寫法結果相同，但只有後者測得到。

- **`emitWithAck` 對沒有回傳值的 handler 會永遠掛著**：Socket.IO 的 ack callback 只在 handler 回傳值時觸發。handler 是 `Promise<void>` 的話，該 Promise 不會 reject 也不會 resolve，症狀是「卡到測試逾時」，看起來像廣播壞了，其實根本沒送出去。改成 `emit` + 等對應的回應事件。

## Prisma / 資料庫

- **軟刪除 model 的所有 read path 都要加 `deletedAt: null`**：`findUnique` 只接受 unique 欄位，要過濾軟刪得改用 `findFirst({ where: { id, deletedAt: null } })`。`count` 用於「是否還有相關紀錄」判斷時（如阻擋刪除有成員的角色）也要排除軟刪，否則永遠刪不掉。例外是「恢復」場景才用 `loadIncludingDeleted` 顯式 opt-in。

- **一次性 token 要原子 claim**：`validateToken + markUsed` 兩步驟之間有 bcrypt 雜湊，併發請求可雙雙通過。改用 Prisma extended where 在單一 UPDATE 同時檢查條件 + 標記使用（`update({ where: { token, usedAt: null, expiresAt: { gt: now } } })`），找不到 record 會丟 P2025。

- **P2002 要在 Repository 層轉成 domain exception**：`findByEmail + create` 存在競態。Repository 的 `create` 外層 try/catch，`err.code === 'P2002'` 時丟 domain exception；Service 層不該感知 Prisma 錯誤。

- **PostgreSQL 的 `DELETE` 不支援 `LIMIT`**：MySQL 可以 `DELETE ... LIMIT n` 分批，PostgreSQL 語法上就沒有這件事。分批要寫成 `DELETE FROM t WHERE ctid IN (SELECT ctid FROM t WHERE ... ORDER BY ... LIMIT n)`。用 `ctid`（實體位置）而非 PK 可省掉第二次索引查找；子查詢與 DELETE 在同一 statement 的快照內求值，對唯寫入不更新的日誌表是安全的。

- **PostgreSQL 容器的 healthcheck 一定要用 `pg_isready`，不能只看行程或埠**：官方映像首次啟動時會**先起一次臨時伺服器**跑 initdb 與初始化腳本，該階段行程已存在但對外連線尚未開放。只檢查行程會得到「已就緒」的錯誤結論，症狀是 api 在資料庫初始化中途連線並以認證失敗告終。

- **`postgres-verify` 的 tmpfs 要掛在 `PGDATA` 的子目錄**：tmpfs 直接掛在 `/var/lib/postgresql/data` 時該目錄非空（掛載點本身），initdb 會拒絕啟動。設 `PGDATA=/var/lib/postgresql/data/pgdata` 讓 initdb 寫進子目錄即可。

### 2026-08-20 — Prisma 的 `///` 註解不會進資料庫，只進 Client 的 JSDoc

**踩到什麼**：以為在 `schema.prisma` 的欄位上加 `///` 描述、重跑 `prisma migrate dev` 就會把描述寫進資料庫。實際上 migration 的 SQL **一個字都不會變**，`psql \d+` 什麼也看不到。

**Why**：`///` 是 Prisma 的 documentation comment，只流向產生的 Prisma Client `.d.ts`（成為 JSDoc）與 DMMF。Prisma **從不產生 `COMMENT ON TABLE / COLUMN`**，資料庫端的註解完全不在它的職責範圍內。兩者是各自獨立的機制，不是同一份資料的兩種呈現。

**How to apply**：要讓描述同時在 IDE 與資料庫可見，就得兩層都寫——`///` 給 Prisma Client，`COMMENT ON` 手動寫進 migration。但**不要手抄**：用 `pnpm --filter @app/api gen:comments` 由 `///` 產生 SQL 再附加到 migration，維持 schema 是單一真相。`COMMENT ON` 冪等，重下會覆蓋，所以改描述時開一支新 migration 重下全部即可。

### 2026-08-20 — Prisma 7 的 CLI 移除了數個常用旗標，且非 TTY 下會靜默卡住

**踩到什麼**：`prisma migrate dev --skip-generate` 報 `unknown or unexpected option`；`prisma migrate reset --force --skip-seed` 直接以 status 130 結束，錯誤輸出被 ts-node 的堆疊蓋掉，看起來像當掉。

**Why**：Prisma 7 精簡了 migrate 子指令的旗標（`--skip-generate` 已不存在）。而偵測到 drift 時 `migrate dev` 會要求互動確認，在非 TTY（腳本、CI、agent）環境下拿不到輸入就以 130 收場——那是 SIGINT 的退出碼，不是「壞掉」。

**How to apply**：先用 `prisma <cmd> --help` 確認旗標存在。要在非互動環境重建資料庫，與其跟 `migrate reset` 的提示搏鬥，不如直接 `psql -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'` 再 `migrate dev`——沒有 drift 就不會有提示。管線加 `< /dev/null` 可讓它立刻失敗而不是掛著等輸入。

## JWT / 認證

- **簽 token 時必須帶 `type: 'access'`**：`JwtAuthGuard` 有 `payload.type !== 'access'` 檢查，缺這個欄位會拒絕所有請求。`JwtPayload.type` 設為必填 union。

- **`REFRESH_SECRET` 必填且不可與 `ACCESS_SECRET` 相同**：optional 化會 fallback 到 JwtModule 的 default secret（= ACCESS_SECRET），雙 secret 失去意義（access 洩漏 = refresh 也洩漏）。

- **`@nestjs/jwt` 的 `sign`/`verify` 會 merge module 的 options**：`issuer`/`audience` 在 `jwt.module` 設一次即可，各呼叫點即使帶 per-call options（`secret`、`expiresIn`）也會套用同一組 iss/aud。注意**改 iss/aud 屬破壞性變更**——既有 token 全部失效，部署後所有人要重新登入。

- **`JwtAuthGuard` 的快取命中與 DB 查詢兩條路徑都要檢查 `member.status`**：只檢查一條的話，停用帳號的舊 JWT 在自然過期前仍可通行。

- **改動 member context 後必須清快取**：`status` / `roleId` / 密碼變更後要呼叫 `clearMemberContext(memberId)`，否則最長延遲 `PERMISSION_CACHE_TTL`（預設 300 秒）才生效。

- **`/auth/forgot-password` 的時間差列舉是已知殘留風險**：email 不存在立刻 return（~10ms），存在則要寫 DB + 寄信（~100ms-1s），可被用來列舉註冊 email。已緩解：per-route `@Throttle({ limit: 3, ttl: 60s })`、回 204 不帶 message、log 不寫 email。要根除得引入 queue 或固定 delay，成本不划算。

## NestJS / HTTP 層

### 2026-07 — Express 5 的 Request augmentation 用 `declare module` 會 silent fail

**踩到什麼**：要幫 `Request` 擴 `member` 欄位，照慣例寫 `declare module 'express-serve-static-core' { interface Request { … } }`。typecheck **通過**，但取用 `request.member` 仍報 `TS2339`。

**Why**：Express 5 的型別把 `Request` 宣告在 `declare global { namespace Express { … } }` 之內，**不是 module export**。對 module 做 augmentation 找不到目標介面，TS 不報錯、只是靜默無效。

**How to apply**：改用 global namespace 形式，檔尾加 `export {}` 讓 TS 視為 module，放在 `src/types/*-augment.d.ts`：

```ts
declare global {
  namespace Express {
    interface Request { member?: MemberContext }
  }
}
export {};
```

- **Express 5 下 literal 路由會被 `:id` 吃掉**：`@Patch('bulk-status')` 即使宣告在 `@Patch(':id')` 之前仍可能被後者先匹配。解法：用兩段式路徑（`bulk/status`），`:id` 只匹配單一 segment。

## Domain Exception / 錯誤處理

- **型別能保證的完整性，不要退回用測試檢查**：錯誤碼與訊息表用 `as const satisfies Record<ResponseCode, …>` 約束，新增 code 忘了補訊息當場 `TS1360`，回饋即時出現在編輯器。用 `satisfies` 而非型別註記（後者會把動態訊息的參數型別抹成 `never[]`）；「靜態／動態」的分類也從表推導，不要手工維護第二份清單。架構測試只做型別擋不住的部分。

- **建構子重載可以把「哪些情況必須傳參數」寫進型別**：`DomainException` 兩個重載讓靜態訊息只傳 `(code, kind)`，需要參數的訊息漏傳直接 `TS2345`，不會出現「函式被當成訊息字串」的執行期怪象。實作簽名的 fallback 分支雖不可達也別留空字串（取 code 本身較安全）；重載寫完務必用探針驗證「該擋的擋、該過的過」。

- **value object 要分 `of()` 與 `trusted()` 兩條路徑**：`of()` 驗證新輸入並拋 `INVALID`（400）；`trusted()` 不驗證，供 `reconstitute()` 從 DB 還原使用。還原路徑若重跑驗證，**資料損毀會被回報成 400**（客戶端輸入錯誤），但客戶端根本沒做錯——那是 500 的情境。改這類設計時注意既有測試可能正在保護舊行為。

## 測試

### 2026-07 — 物件組態的 Prisma 跑真 DB e2e：runtime 與 migrate CLI 吃的組態不是同一套

**踩到什麼**：runtime 用 `PrismaMariaDb({ host, user, password, database })` 物件組態（無 `DATABASE_URL`），但 e2e 的 `global-setup` 要跑 `prisma migrate deploy` 建測試庫的表——**CLI 只吃 `DATABASE_URL`**。

**Why**：Prisma 7 的 driver adapter 與 CLI 是兩條路徑，adapter 走程式碼傳入的物件、CLI 走環境變數，互不相通。

**How to apply**：(1) `helpers/e2e-env.ts` 從真 `.env` 載帳密；(2) **守門**：斷言 `DB_TEST_DATABASE` 名稱含 `test`，不含就 throw（防打到正式庫），通過才覆寫 `DB_DATABASE`；(3) `global-setup.ts` 建庫後 `execSync('pnpm exec prisma migrate deploy', { env: { …, DATABASE_URL: '…' } })` 現組 URL 給 CLI。用 **`pnpm exec` 而非 `npx`**（monorepo 下 npx 抓不到 workspace bin）。帳密只在 runtime 從 `.env` 讀，絕不寫進任何檔案。

### 2026-07 — e2e 過不了 `@Roles(SUPERADMIN)`：JWT payload 裡根本沒有 roleCode

**踩到什麼**：`SecurityController` 掛 `@Roles('SUPERADMIN')`，e2e 用 admin 帳號登入卻一直 403。

**Why**：`JwtPayload` 刻意輕量只存 `sub`，`request.member.roleCode` 是 `JwtAuthGuard` **每個 request 從 DB 撈的**。seed 的 role 沒設 `roleCode`，guard 撈到的自然不是 `SUPERADMIN`。

**How to apply**：`seedMember` / `seedRole` 開 `roleCode?` 參數。注意 **roleName（顯示名「管理者」）與 roleCode（權限碼）是兩回事**，gate 比對的是後者。

- **`jest.clearAllMocks()` 不會清掉 `mockReturnValue` 設定的實作**：它只清呼叫紀錄。前一個 `it` 設的回傳值會滲進後面所有測試，症狀是「單獨跑會過、整支跑會失敗」。`beforeEach` 要明確重設每個 mock 的回傳值，或改用 `mockReset()`。

- **debug 測試時不要相信 console.log 的輸出順序**：jest 會緩衝並在報告階段統一輸出，同一支測試內的先後看起來會亂掉，跨 hook（`afterEach`）更明顯。追時序問題要在訊息裡自帶時間戳，或直接量測耗時。

### 2026-08-16 — 測排序時，fixture 的插入順序必須與期望排序相反

**踩到什麼**：6 處 `orderBy`（member / role / permission / ip 名單）**全部拿掉，138 支 e2e 依然全綠**——排序行為完全沒有測試保護。`security.e2e-spec.ts` 雖有 `list[0].ipAddress` 這種依賴順序的斷言，但 seed 資料太少，刪掉 `orderBy` 也照樣過。

**Why**：少了 `ORDER BY` 時資料庫回傳順序是**未定義**的（實務上是插入順序、索引順序或主鍵順序）。若 fixture 的插入順序剛好等於期望順序，測試就分辨不出「真的照 orderBy 排」還是「碰巧照插入順序回傳」。

**How to apply**：讓插入順序與期望排序**相反**——測 `desc` 就按舊→新插入、測 `asc` 就按新→舊插入。另外**筆數決定反向驗證的可靠度**：主鍵是 uuid 時回傳順序近乎隨機，n 筆有 `1/n!` 機率碰巧命中，3 筆是 1/6（實測真的碰到過一次假綠，重跑 3 次才紅），4 筆降到 1/24。範本見 `test/ordering.e2e-spec.ts`。

### 2026-08-14 — 靜態掃描型的架構測試有兩種「假綠」

**踩到什麼**：(1) 規則寫好跑起來全綠，實際上因為 controller 命名是 `XxxController.ts` 而非 `xxx.controller.ts`，glob 掃到 **0 個檔案**；(2) 違規修掉後豁免清單忘了刪，白名單單向膨脹成無人維護的例外清冊。

**Why**：「沒有違規」與「沒有掃到東西」在斷言上長得一模一樣。

**How to apply**：每條規則加 `expect(files.length).toBeGreaterThan(0)`，並驗證每筆豁免在原始碼中**確實仍存在**。新增規則後一律「插違規探針 → 親眼看它紅 → 移除 → 確認 `git diff` 乾淨」。

**已知盲區**：靜態掃描看不到**套件動態註冊的路由**（如 `/api/metrics` 由條件註冊的 `PrometheusModule` 提供、沒有 controller 檔）。所以「架構測試會抓出所有未寫文件的路由」這個預期並不成立。

- **掃字元的規則會掃到自己**：禁用某組字元的守則，其定義檔必然寫著那些字元，掃自己一定紅。把規則檔自身排除並在註解寫明理由（不是豁免，是自我指涉）。同理，review 報告會逐字引用問題碼，`pr/` 之類的目錄也該排除。
- **掃描原始碼的規則要先剝註解**：以「引號 + 中文字元」偵測硬編文案時，TSDoc 裡的 markdown 反引號（`` `code` `` 後接中文）會被當成字串字面值，一次誤判 4 處。**OpenAPI yaml 更是完全不能用 regex 解析**——多行 `description: |` 區塊裡的文字會被當成 path / method 節點，曾得出「35 條路由全部不同步」的荒謬結果（**極端結果本身就是 bug 的訊號**）。yaml 一律用 `js-yaml`。
- **架構測試與 lint 的分工判準是「eslint 表達得了嗎」**：單檔即可判定的 import 邊界交給 eslint（快、IDE 即時）；跨檔語意（錯誤碼註冊、死碼、env 宣告）交給架構測試。**型別能保證的完整性兩者都不用寫**（如「用到不存在的常數」TypeScript 已免費擋掉）。
- **寫 spec 前先 Read 受測檔的真實簽章，不要憑模式猜**：常見誤判——`execute({ id })` 其實是 `execute(id)`、repo 回 `{ list, meta }` 其實是 `{ data, total }`（轉換在 service）、建構子參數順序。動筆前先讀「受測 class + 它呼叫的 port interface + in-port Command 型別」三者。同理，Guard 邏輯或 Port 介面變更後，既有 spec 的 mock payload / mock 物件要同步更新，否則錯誤訊息會誤導排查方向。
- **`jest.clearAllMocks()` 不清 mock implementation**：`mockImplementation(() => { throw … })` 設的錯誤會洩漏到後續測試。一次性行為用 `mockImplementationOnce` / `mockResolvedValueOnce`，或改用 `mockReset()`。因此 spec 的 `beforeEach` 常有一份「逐一重設各 mock 預設回傳」的清單——**新增 mock 方法時務必同步加進去**，否則某支測試設的 `mockResolvedValue` 會洩漏到下一支。實例：`getBlacklistReason` 漏加，一支測試設的 `'rotated'` 讓後面的「帳號停用 → 403」變成 401，錯誤訊息完全指不到原因。
- **`mockResolvedValueOnce` 佇列沒被消費完也會洩漏**：`clearAllMocks()` 不清 once 佇列。改了 SUT 的查詢方法（`findUnique` → `findFirst`）後，原本餵的 once 值變孤兒，會被「下一個剛好呼叫該方法的測試」吃掉，症狀是莫名 500 或狀態碼錯亂。改查詢方法時全文搜尋相關的 `*Once` 確認都會被消費。
- **mock 斷言的 spec 轉真 DB 後會變短也變真**：`toHaveBeenCalledWith(...)` → 先 seed、呼叫 API、再查庫驗證**落庫值**；「更新不存在 → P2025 → 404」不必手動 `setPrototypeOf` 偽造錯誤，真庫直接 PATCH 一個不存在的 UUID 即可。每個 spec `beforeEach` 先 `resetDb`（依 FK 序）再 seed，序列執行避免 race。
- **Zod v4 的 `z.string().uuid()` 嚴格檢查 RFC 4122**：測試 fixture 用 `00000000-0000-0000-0000-000000000001` 這種會被拒（version nibble 不合法），要用 `…-4000-8000-…` 這類合法值。
- **往 port 加方法時，e2e 的假實作要一起補**：新增 `TokenBlacklistPort.getBlacklistReason` 後，單元測試（自帶 mock）與 `typecheck`（介面有宣告）全綠，但 `createMockRedis` 少了那個方法，e2e 一跑就 500。**只有 e2e 跑真的 DI 容器，這類「介面對了但假實作沒跟上」只有它抓得到**——改動 port 之後別跳過 e2e。
- **e2e 跑完 Jest worker 卡住 → `forceExit: true`**：Nest app 關閉後仍有 handle 未釋放（Redis mock、Prisma 連線池）。
- **Redis 仍 mock 時，限流與黑名單在真 DB e2e 中不會誤觸**：`throttleIncrement` 回固定值，序列連跑不會累計到 429；改成真 Redis 時要重新評估。

## 建置 / 工具鏈

- **`tsBuildInfoFile` 必須放在 dist 內**：`nest-cli.json` 的 `deleteOutDir: true` 每次 build 刪整個 dist，但 `.tsbuildinfo` 預設在 root 不會被清 → TS 以為「沒變動 = 不用 emit」→ build 完 dist 是空的、啟動失敗。設 `"tsBuildInfoFile": "./dist/.tsbuildinfo"`；遇到「改了 code 卻沒重編」先刪它。
- **`preserveWatchOutput: true`**：否則 `tsc --watch`（含 `nest start --watch`）用 alternate screen buffer，每次重建會吃掉終端 scrollback，先前的 Vite ready URL 等輸出全消失。
- **Husky pre-commit 在 nvm 環境找不到 pnpm**：nvm 的 node/pnpm 只在互動 shell 載入後才進 PATH，git commit 的子 shell 不一定繼承。`.husky/pre-commit` 開頭加 `command -v pnpm || . "$HOME/.nvm/nvm.sh"`。
- **api 的 `lint` 必須先 `db:generate`**：client 未生成時 Prisma 回傳被推成 `any`，`recommendedTypeChecked` 會噴大量假陽性（`no-unsafe-call`、`require-await`）。加 `"prelint": "pnpm db:generate"`。注意 lint-staged 直接呼叫 `eslint --fix` 不走 pre 腳本。
- **Monorepo 共用 ESLint 基底不能含 tseslint 預設集**：api 走 `recommendedTypeChecked`、web 走 `recommended`，兩者都會註冊 `@typescript-eslint` 外掛；基底再帶一組會觸發 `ConfigError: Cannot redefine plugin`。基底只放 `ignores` + `js.configs.recommended` + 家規（家規以 named export 交由各 workspace **在自己的 tseslint 預設之後**最後套用，否則 `no-explicit-any` 會被蓋回 error）。
- **type-aware lint 對 ORM 邊界 / jest mock / seed 腳本要分區關掉 `no-unsafe-*`**：這些地方天生 `any`，全開會爆數百個假訊號淹沒真發現（本專案 524 → 9）。核心層（application / domain / infrastructure）維持全嚴格，floating-promise 這類真問題才浮得出來。
- **`.prettierignore` 相對「執行目錄」解析，不是逐檔就近**（與 `.prettierrc` 不同）：所以 `format` / `format:check` 必須放**根**並從 repo root 跑才吃得到。根 ignore 必排除手寫繁中文件（`**/*.md`，否則 openspec / README 被 reflow）、工具生成檔（`schema.ts`、swagger bundle）、`prisma/migrations`。

- **驗 GitHub Actions workflow 用 Docker 版 actionlint，別用 `pnpm dlx`**：npm 上的 `actionlint` 套件不含執行檔（`ERR_PNPM_DLX_NO_BIN`），而且它**成功時完全沒有輸出**，很容易誤判成沒跑到。用 `docker run --rm -v "$(pwd)":/repo -w /repo rhysd/actionlint:latest .github/workflows/ci.yml`，以 exit code 判定。

### 2026-08-14 — eslint flat config 中同名規則是「後蓋前」，不會合併 patterns

**踩到什麼**：`no-restricted-imports` 拆成多個區塊各給一組 `patterns`，結果 admin 目錄下的 controller 該同時受「不得碰持久層」與「不得相依 front」兩條約束，**實測只有後者生效**，前者靜默失效而 lint 全綠。

**Why**：同時匹配多個區塊的檔案，該規則只吃**最後一個**區塊的設定，先前的整包被覆蓋。

**How to apply**：重疊的檔案範圍必須各自列齊**完整**限制——用 `ignores` 切成互不重疊，重疊者（如 `src/adapter/in/**/admin/**/*Controller.ts`）一次列出所有 pattern。另外用 `@typescript-eslint/no-restricted-imports` 而非 base 版，才涵蓋 `import type`。每加一條邊界規則都要用探針實測「該擋的每一種都真的擋」。

## Monorepo / pnpm

### 2026-08-14 — pnpm 10+ 的 `overrides` 寫在 `package.json` 會被靜默忽略

**踩到什麼**：三條 override 長期完全沒生效——宣告 `@hono/node-server >=1.19.13` 實際裝 1.19.11、宣告 `@tootallnate/once 3.0.1` 實際裝 2.0.1。**沒有任何警告**。

**Why**：雙重錯誤——pnpm 的 overrides 只在 workspace **root** 生效，且 10+ 起又從 `package.json` 搬到 `pnpm-workspace.yaml`（`allowBuilds` 等設定同批搬遷）。

**How to apply**：(1) overrides 一律寫 `pnpm-workspace.yaml`；(2) 改完檢查 `pnpm-lock.yaml` 開頭是否出現 `overrides:` 區塊——**這是 pnpm 有讀到的唯一證據**；(3) 再以 `pnpm why <pkg>` 確認實際版本。range 用 `^` 不要用 `>=`：後者沒有上界，pnpm 會直接拉到最新 major（實測 `@hono/node-server` 跳到 2.1.0）。

- **pnpm 11 預設不執行套件的 build scripts**：Prisma、bcrypt、@nestjs/core 等有 postinstall 的套件會被擋下並警告 `ERR_PNPM_IGNORED_BUILDS`，需在 `pnpm-workspace.yaml` 的 `allowBuilds` 明確核准（`true` 信任 / `false` 明確拒絕，如 telemetry-only 的 `@scarf/scarf`）。
- **Monorepo 下 Prisma client 落在 pnpm 虛擬 store**：生成在 `node_modules/.pnpm/@prisma+client@…/` 而非傳統路徑。搬完 monorepo **必須先跑一次 `db:generate` 再 typecheck**，否則所有 model 型別找不到，會誤導成 strict mode 的問題。

## 外部服務 / 排程

- **所有外部服務呼叫都要設 timeout**：沒 timeout 時單一服務變慢會耗盡連線池 / event loop、拖垮整個 API。recaptcha 用 `AbortSignal.timeout(5000)`；nodemailer 設 `connectionTimeout` / `greetingTimeout` / `socketTimeout`；S3 用 `client.send(cmd, { abortSignal })`；firebase-admin 不支援 AbortSignal，用 `Promise.race`。
- **Redis 要設 `socket.connectTimeout` + `pingInterval`**：`isOpen` 只看連線旗標，偵測不到 half-open（socket 開著卻無回應），指令會 hang 到自己 timeout。token 黑名單採 **fail-closed**（Redis 斷線拋 503，不放行已登出 token）。

### 2026-07 — `@Cron('expr')` 的表達式在「模組載入時」求值，讀不到 `.env`

**踩到什麼**：cron 表達式想從 env 讀，拿到 `undefined`；在 decorator 內呼叫 `getEnv()` 更直接 `process.exit(1)`。

**Why**：import 會 hoist 到檔案最上方，`AppModule`（含排程器）在 `main.ts` 的 `dotenv.config()` **之前**就被 require，decorator 的參數那時已經求值。

**How to apply**：改在 `onModuleInit()`（dotenv 已載入）用 `SchedulerRegistry.addCronJob(name, CronJob.from({ cronTime, onTick, timeZone }))` 動態註冊。`CronJob` 來自 `cron` 套件（`@nestjs/schedule` 沒 re-export），版本要與 schedule 內部相依一致。

## 單一埠部署 / ServeStatic

- **`ServeStaticModule` 用 `forRootAsync` + 執行期偵測，不要在 `@Module` 載入時判斷**：`@Module` 的 imports 在 import 時就 evaluate，那時 e2e fixture 還沒建。`forRootAsync({ useFactory })` 在 `app.init()` 才偵測 `index.html`（前端未 build 時回 `[]` 等同不掛載）。
- **`exclude` 要用 Express 5 / path-to-regexp v8 的 named wildcard `'/api/{*path}'`**：舊式 `/api*`、`/api/*` 都不對；`'/api/*path'` 會漏掉裸 `/api`。漏設會讓 API 的 404 回 `index.html`（HTML）而非 JSON。本機媒體 static 同理要加 `/media/{*path}`，否則被 SPA fallback 攔截。
- **e2e 測 serve-static 要把 `AbstractLoader` override 成 `ExpressLoader`**：loader factory 依 `httpAdapter` 是否存在挑 loader，測試用 `compile()` 在 `createNestApplication` 之前就實例化 → 拿到 **NoopLoader**（靜態檔全 404）。

## 檔案上傳

- **multipart 中文檔名要 latin1→UTF-8 還原**：busboy/multer 預設以 latin1 讀 filename，中文變亂碼。存入前 `Buffer.from(name, 'latin1').toString('utf8')`。
- **multer 2.x 的 `Express.Multer.File` 全域型別解不到**：2.x + @types/multer 2.x 不再穩定擴充全域 namespace，會報 `Namespace 'global.Express' has no exported member 'Multer'`。controller 自定最小型別（只取 `buffer/mimetype/size/originalname`）避開。
- **大小上限要在 service 檢查，不要放 decorator**：decorator 選項在模組載入時求值、讀不到 env（同 `@Cron` 那條）。multer decorator 另設大的靜態硬上限防 OOM 即可。

## 前端

- **自訂 hook 回傳的函式若會進 useEffect deps，必須 `useCallback`**：否則每 render 新 instance → effect 每 render 都跑 → 內部 setter 改父 state → 再 render，Chrome 會擋 `Throttling navigation to prevent the browser from hanging`。且 **dep 不能放整個 hook 回傳的 object**（每 render 都是新 reference，等於沒包），要 destructure 出 method 再放。
- **zod v4.1+ 不要用 `zodResolver`，改用 `standardSchemaResolver`**：`@hookform/resolvers/zod` 的 v4 overload 檢查 `_zod.version.minor === 0`，zod 4.1+ 會報 `Type '4' is not assignable to type '0'`。zod v4 原生實作 Standard Schema，換 valibot/arktype 也同一 resolver。
- **react-hook-form 的 schema 不要用 zod `.transform()`**：會讓 input/output 型別分歧，而 `useForm<T>` 把 T 同時套在 defaultValues / control / handleSubmit 三邊。normalize 放 submit handler，schema 只做 validate。
- **`useInfiniteQuery` 不會走 `useApiQuery` 的 envelope unwrap**：自寫 `queryFn` 用 `apiClient.GET` 不經過 unwrap，`lastPage.list` 會是 undefined（實際是 `{ success, data: { list, meta } }`）。從 `@app/api-client` export `unwrapEnvelope` 手動呼叫。
- **shadcn nova preset 的 registry 沒有 `form`**：`shadcn add form` 會 silent fail（只印 "Checking registry"），其他元件正常。自寫 `components/ui/form.tsx`（標準 Controller + Slot + FormItemContext pattern）。
- **TypeScript 6 把 `baseUrl` 標為 deprecated**：tsconfig 只需要 `paths`，其中的相對路徑以 tsconfig 所在位置為基準。shadcn CLI 看的是 `components.json` 的 aliases，不依賴 baseUrl。

## Zod / 驗證

- **`z.coerce.boolean()` 對字串 `'false'` 會 coerce 成 `true`**：底層走 JS `Boolean()`，非空字串皆 truthy，`?status=false` 會變成 `true`。query 的 boolean filter 一律用 `z.enum(['true','false']).optional().transform(v => v === undefined ? undefined : v === 'true')`。

## 架構慣性

- **`@Roles` / `RolesGuard` 受 feature flag 控制，注意爆炸半徑**：`adminRoleEnabled` 關閉時 RolesGuard 一律放行，所有 `@Roles` 端點（IP 黑白名單、帳號解鎖）對任何已登入者開放。生產由 validate-env 強制開啟守住，但**勿在共用的 dev 環境關閉**。
- **不要讓 Facade 直接呼叫 Out Port、跳過 Service 層**：少了 service，domain 規則（IP 正規化、unlock 前狀態檢查）沒地方放，只能擠進 facade 或 controller。即使動作簡單也保留 service 佔位，未來補 domain rule 零摩擦。
- **同資料但「呼叫情境不同 = 權限模型不同」時，開窄化 endpoint**：Combobox 要顯示不在第一頁的角色名稱，`GET /roles/:id` 看似夠用但需 `BACKEND:ROLE:VIEW`，只有 `BACKEND:ACCOUNT:VIEW` 的會員管理者打不到。開薄的 `GET /members/role/options/:id` 沿用會員管理權限，不要借別模組的 endpoint。

### 2026-07 — 搬整包資料夾深一層 = 兩個正交轉換，可腳本化但 `jest.mock` 會漏

**踩到什麼**：把 flat 結構搬進 `<side>/` 時，typecheck 全綠但 jest 執行期掛掉。

**Why**：兩個轉換是正交的——(1) 把 `<side>/` 段插進「指向 in 側各層」的 import 路徑；(2) 被搬檔案的每個 `../` 各 +1 層。但 **`jest.mock('../…')` 是字串字面量，TS 不當 module 解析**，所以深度 +1 漏掉它時 typecheck 不會報錯。

**How to apply**：兩個轉換先 (1) 後 (2)，且 (2) 必須一併涵蓋 `jest.mock` / `require` 的路徑字串。用 `git mv` 保留歷史（rename 偵測門檻內，內容改太多會顯示成 D+A）。

## OpenSpec workflow

- **propose 階段先核對 API contract，不要假設「list 有的欄位 update 也支援」**：例如 role 的 GET 回應有 `status`，但 `PATCH /roles/:id` 的 DTO 沒處理它，誤判成「純前端 change」會在動工後才發現要連動改後端 + Swagger + api-client + spec + e2e。寫 proposal 前先讀 `{Create,Update}*Request.ts` 與對應 service，把每個前端互動點對應到實際 DTO 欄位。
- **archive 前先把 swagger / api-client / 前端同步完**：這些屬 feat 的尾巴，混進 archive commit 會讓未來 cherry-pick / revert 歸檔時連帶動到 swagger。順序：`swagger:bundle` → `api-client generate` → 驗證鏈 → commit feat → 才 archive。archive 後若 `git status` 還有 swagger / schema.ts 變動，是前面沒做乾淨。
- **archive commit body 要列出新建 / 修改的 master spec**：只有標題的話，未來 `git log` 追不到「某 capability 何時定義 / reqs 何時變動」。reqs 數量用 `grep -c "^### Requirement:" openspec/specs/<spec>/spec.md` 取得。

### 2026-08-20 — 三個「規則本身沒錯，但看不見新東西」的變體

**踩到什麼**：同一個形狀在 `add-chat-rooms` 又出現了兩次（先前已有 `layering` 只掃 `*Controller.ts`）：

1. `classDecorators()` 從 `@Controller(` 起算取裝飾器區段。`@MemberScoped()` 寫在 `@Controller` 上方，整個被漏看——端點明明表態了卻被判沒表態。
2. 修法一改成「找最早出現的裝飾器」後，註解裡提到的 `@Roles(` 把起點拉進註解內部，`stripComments` 因為少了 `/*` 開頭而失效，說明文字就此冒充成真裝飾器。守則自身的合成測試 C 當場抓到。

**Why**：字串定位的守則有兩個獨立的失效面——**掃描範圍**（看不看得到）與**判定依據**（看到了判不判得準）。改動其中一個常常破壞另一個。

**How to apply**：定位任何程式碼片段前先 `stripComments`，順序不能反。守則的合成輸入測試不是裝飾——它是唯一會在你改動判定邏輯時出聲的東西；C 這種「註解冒充」案例每條規則都該有一個。

### 2026-08-20 — 錯誤碼與它的 exception 是鏈式依賴，不能分塊

**踩到什麼**：tasks.md 把新增 `ResponseCodes` 放塊 1、用它的 domain exception 放塊 3。塊 1 驗證直接紅：`response-codes.spec.ts` 擋下「已註冊但無人使用」的死碼。

**How to apply**：切塊時，「新增錯誤碼 + 訊息 + exception」視為一個單位。判斷準則是「這個塊單獨跑驗證鏈會不會綠」，不是「概念上是不是同一件事」。

### 2026-08-20 — `roomType` 這類欄位用 DB enum，不要 VarChar + 型別斷言

**踩到什麼**：`roomType String @db.VarChar(16)` 配 TS 聯集型別，讀取端只能寫 `row.roomType as ChatRoomType`。

**Why**：那個 `as` 是在騙型別檢查——DB 裡真的出現非法值時，程式會拿著一個型別系統保證不存在的值繼續跑。

**How to apply**：固定集合的欄位用 Prisma enum。非法值在寫入時就被 DB 擋下，讀取端的型別自然收斂，不需要斷言也不需要 runtime 轉換。（PHP 那邊同理；TS 專案禁的是 TS `enum`，不是 DB enum。）

### 2026-08-20 — 模組互相 import 的解法是抽出「只碰資料庫」的那一層

**踩到什麼**：WS gateway 需要房間成員資格判斷、前台的離開房間需要 WS 的事件送出端 → `FrontChatRoomModule` 與 `ChatWsModule` 互相 import。

**How to apply**：抽出不依賴任何一方的核心（`ChatRoomCoreModule`：持久層 + 成員資格判斷），兩邊都 import 它。**不要用 `forwardRef` 遮**——它讓循環繼續存在，只是不再報錯，而下一個循環會更難拆。抽出的模組要在註解裡寫明「刻意不相依 X」，否則之後有人在裡面加一行推播就把循環帶回來了。

### 2026-08-21 — `socket.once` 在併發等待時會一次觸發全部監聽器

**踩到什麼**：整合測試用 `waitForEvent`（內部是 `socket.once`）等 ack，`Promise.all` 併發送 5 則訊息時，5 個 Promise 全部拿到**同一份** ack，`Promise.all` 在其餘 4 則還沒寫完就返回。

**Why**：`once` 只保證「自己被呼叫一次後移除」，不保證「只有一個監聽器被觸發」。事件抵達時**所有**已註冊的監聽器都會執行。併發情境下 N 個 `once` 會在第一個事件全部觸發。

**How to apply**：等待「屬於某個請求」的回應時，必須用 `on` + 依關聯 ID 過濾 + 手動 `off`，不能用 `once`。症狀非常誤導——它長得像「伺服器序號配錯」或「寫入沒完成」，而伺服器完全正常。

### 2026-08-21 — 等待型測試輔助一定要監聽失敗事件

**踩到什麼**：`waitForAck` 只等成功事件，於是任何送出失敗（本例是限流擋下）都表現成「等 ack 逾時 5 秒」，訊息裡沒有任何線索指向真正的原因。查了兩輪才發現是自己在 `setup-env.integration.ts` 設的限流閾值太低。

**How to apply**：任何「送出請求 → 等回應」的測試輔助，都要同時監聽對應的錯誤事件並用它的內容 reject。逾時訊息應該是最後手段，不是預設的失敗形式。順帶：測試環境的閾值若與測試行為耦合（例如限流閾值 vs 單一測試的最大連發數），把這個約束寫在設定檔的註解裡。

### 2026-08-21 — 跨行同時處理多條 SQL 語句時，不要用跨行 regex 刪除

**踩到什麼**：想從 migration 移掉一條重複的 `COMMENT ON`，用了 `COMMENT ON ... IS '[^']*';` 這種 regex，結果把**前一條語句的結尾**一起吃掉，migration 直接語法錯誤。

**How to apply**：處理 SQL / 帶引號字串的檔案時，以「完整語句」為單位比對（配對開頭與結尾），不要用會跨越語句邊界的 regex。`[^']*` 能匹配換行，這正是它危險的地方。

### 2026-08-21 — `openspec new change` 會產生 `openspec/config.yaml`，預設值是錯的

**踩到什麼**：該檔案內容是 `schema: spec-driven`（內建預設），而非本專案的 `spec-driven-custom`。它一出現就是錯的，且沒有徵兆——change 照樣建得起來、`openspec validate` 照樣過，只是本專案的格式規範全部不生效。

**How to apply**：已改指向 custom 並補守則釘住（`openspec-schema.spec.ts`），所以這件事不需要記憶了。留下這條是因為**「工具自動產生的設定檔預設值與專案不符」這個形狀會再出現**——看到工具自己生出設定檔時，先確認它的預設值。

### 2026-08-21 — `prisma migrate dev` 會立刻套用，附加 COMMENT ON 要在那之後重建 DB

**踩到什麼**：`migrate dev` 產生並**同時套用**了 migration，我之後才把 `COMMENT ON` 附加到檔案裡——於是描述沒進 DB，且檔案的 checksum 與已套用紀錄不符，下一次 `migrate dev` 直接要求重置。

**How to apply**：兩條路可選——(a) 用 `migrate dev --create-only` 產生但不套用，附加完 `COMMENT ON` 再 `migrate deploy`；(b) 照現在的流程做，但附加完**必須** `DROP SCHEMA public CASCADE` + `migrate deploy` 重建一次。本專案的 dev DB 平時是空的，(b) 成本很低，但務必**先確認沒有資料**再重建。

### 2026-08-21 — `getEnv()` 有快取，執行期改 `process.env` 不會生效

**踩到什麼**：稽核 adapter 每次呼叫都 `getEnv().CHAT_AUDIT_ENABLED`，我還寫了註解說「每次讀取，這樣測試覆寫才有效」。e2e 裡把 `process.env.CHAT_AUDIT_ENABLED` 設成 `'false'` 卻照樣寫入——因為 `getEnv()` 內部有 `_env` 快取，第一次解析後就固定了。

**Why**：那對設定是**正確**的行為（環境變數不該在執行期變動），錯的是我的註解與測試策略。

**How to apply**：要測「開關關閉」的行為，只能在單元測試裡 `jest.mock` 掉 `validate-env` 並 mock `getEnv`（`RedisMessageRateLimitAdapter.spec.ts` 就是這個作法）。e2e 改不動它。順帶一提：**寫註解斷言某個機制怎麼運作之前，先確認它真的那樣運作**——那句錯誤的註解會讓下一個人也走同一條死路。

### 2026-08-21 — 反向驗證會告訴你「真正的防線是什麼」，而不只是「測試有沒有用」

**踩到什麼**：為了確保「檢舉列表不外流內容快照」，我在 repository 的 `listSelect` 排除了 `contentSnapshot`，並寫 e2e 釘住。反向驗證時把它加回 select——**e2e 卻沒有變紅**。

**Why**：投影函式 `toListItem()` 不會把它複製到輸出，所以 API 回應仍然乾淨。再往前把它加進投影函式，**TypeScript 直接編譯失敗**——列表視圖的型別裡根本沒有這個欄位。

**How to apply**：反向驗證不只是「確認測試會紅」，它會告訴你**哪一層在真正防守**。這次的答案是型別（列表與詳情是兩個型別），select 只是順手的最佳化，e2e 是最後的背書。**如果沒做反向驗證，我會以為防線是 select，然後在下一個類似情境重複一個其實沒有效果的作法。**

推論：要保證「某個欄位不外流」，最強的作法是讓它**在型別上就不存在**於對外視圖，而不是靠查詢層排除或靠測試檢查。

### 2026-08-21 — 守則要分「寫入」與「讀取」，best-effort 只適用於前者

**踩到什麼**：稽核守則要求「所有 `this.audit.x()` 呼叫都要 catch」。新增行為時間軸查詢（`audit.listByMember()`）後，守則立刻誤報。

**Why**：best-effort 的立場是「**記錄**失敗不該讓業務失敗」。它不適用於查詢——稽核查詢失敗時靜默回空清單，會讓調查者以為那個人什麼都沒做過，那比報錯嚴重得多。

**How to apply**：判定改成只認 `.record(`。這與先前限流守則的「消費者 ≠ 實作」是同一類：**規則的動詞要精確**，「碰到這個 port」與「用它做某件特定的事」是兩回事。

### 2026-08-21 — swagger 用 `allOf` 會讓 api-client 的產物編不過，而 `swagger:check` 抓不到

**踩到什麼**：後台檢舉詳情的回應用 `allOf` 合併「列表欄位 + 詳情欄位」，`swagger:bundle` 與 `swagger:check` 都通過，**但 `pnpm typecheck` 在 `packages/api-client` 爆掉**——openapi-typescript 產出交集型別，codegen 之後取 `.schema` 失敗。

**Why**：`swagger:check` 驗的是「產物是不是最新」，不是「產物編不編得過」。兩者是不同的問題。

**How to apply**：swagger 的回應 schema **不要用 `allOf`**，明列欄位即可（囉嗦但產得出可編譯的型別）。共用結構用 `$ref` 指向整個 schema 是可以的（`_message.yaml` / `_room.yaml` 都這樣），問題只出在 `allOf` 的合併。另外：**動到後台 swagger 一定要跑 `pnpm typecheck`**，只跑 `swagger:check` 會漏。

### 2026-08-21 — 「每一層都正確，但沒有人負責銜接」是一整類缺口

**踩到什麼**：帳號停用做對了（`status` + 清快取 + `ResolveMemberContext` 擋下）、WS 認證做對了、房間授權做對了——但**被停權的人只要 WS 連線還開著就能繼續送訊息**。連線層的認證只在 handshake 執行一次，之後的事件只驗資源層級的授權。

**Why**：既有的守則每一條管的都是自己那一層，沒有一條會問「A 層的狀態變了，B 層怎麼辦」。這類缺口不是任何一層寫錯，而是**沒有人被指派負責那個銜接**。

**How to apply**：新增任何「改變某個長效狀態」的功能時，問一句「**有沒有已經建立、且依賴這個狀態的東西？**」——長連線、快取、排程、已發出的 token。守則要盯**銜接點**而非某個實作（本例是「呼叫 `deactivate()` 的 service 必須撤銷連線」，而不是「gateway 要訂閱某事件」），這樣日後多一條路徑也會被抓到。

### 2026-08-21 — 整合測試的 `logger: false` 會把 DI 錯誤變成 `process.exit(1)`

**踩到什麼**：模組循環（`MemberModule → ChatWsModule → MemberContextModule → MemberModule`）讓 NestJS 啟動失敗，但 `startInstance` 用 `{ logger: false }`，錯誤訊息完全被吞掉，只看得到 `process.exit called with "1"` 與一行堆疊。

**How to apply**：整合測試起不來時，**先把 `logger: false` 拿掉再跑一次**——NestJS 的 DI 錯誤訊息會明確指出哪個模組解不出哪個 provider。查完再改回去（保留它是為了測試輸出乾淨）。

模組循環的解法一律是「**抽出葉節點**」而非 `forwardRef`：本例是讓 `MemberContextModule` 改指向持久層模組。`forwardRef` 讓循環繼續存在、只是不再報錯，而下一個循環會更難拆。

### 2026-08-21 — 用 grep 數錯誤數量是壞掉的驗證，改用 exit code

**踩到什麼**：一直用 `pnpm lint 2>&1 | grep -cE '  error'` 檢查 lint，回報「0 個錯誤」。CI 卻紅了（`@typescript-eslint/await-thenable`）。

**Why**：eslint 的輸出**帶 ANSI 色碼**——實際文字是 `  65:5  <ESC>[31merror<ESC>[39m  ...`，兩個空格後面不是 `error` 而是跳脫序列。那個樣式**永遠匹配不到**，所以它回報的「0」不是「沒有錯誤」，是「這個檢查什麼都沒檢查」。

前幾次的 lint 確實是乾淨的（CI 證實），但**驗證方法本身是壞的**——它不會告訴我任何事，只是碰巧與事實一致。

**How to apply**：**驗證一律看 exit code，不要用 grep 數行數**：

```bash
pnpm lint > /tmp/lint.log 2>&1; echo "exit=$?"
```

grep 只用來**讀**已經知道失敗的日誌，不用來**判斷**成功與否。同一個陷阱適用於任何有色輸出的工具（jest、tsc、prisma）。這也是為什麼 e2e 的間歇性失敗三次都沒抓到證據——同一類的管線過濾問題。

### 2026-08-21 — exit code 說「失敗」，但沒說是誰失敗：`pnpm --filter` 跑不存在的 script 也回 1

**踩到什麼**：反向驗證時用 `pnpm --filter @app/api jest <單檔>` 想確認測試會變紅。它回 exit 1，我當成「測試如預期失敗」。把程式碼還原後**又回 1**，才發現不對——真正的輸出是 `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT: None of the selected packages has a "jest" script`。整個反向驗證是空的。

**Why**：`pnpm --filter <pkg> <cmd>` 只跑 `package.json` 的 **script**，`jest` 不是 script（`test` 才是）。而在 workspace 目錄裡直接 `pnpm jest` 會落到 `node_modules/.bin`，所以同一個指令換個位置就能動——這是它最容易誤導人的地方。**執行失敗與測試失敗的 exit code 都是 1**。

**How to apply**：反向驗證要成立，必須**兩邊都看**：破壞後紅、還原後**綠**。只看到「紅」不能證明任何事——還原後沒有回到綠，就代表紅的原因不是你以為的那個。跑單一測試檔用 `cd apps/api && pnpm jest <path>`，不要用 `--filter`。

這與上一條互補：exit code 是對的驗證方式，但它只回答「成功了嗎」，不回答「跑的是不是你以為的東西」。

### 2026-08-21 — jsdom 沒有 pointer capture，Radix 的下拉在測試中永遠打不開

**踩到什麼**：`ReviewForm` 的判定下拉寫了一支「沒有『回到待處理』選項」的測試，`userEvent.click(combobox)` 之後找不到任何 `role="option"`。改用鍵盤 `{Enter}` 一樣找不到。

**Why**：Radix 的 `Select` / `DropdownMenu` 用 `hasPointerCapture` / `setPointerCapture` 判斷拖曳、用 `scrollIntoView` 把選中項捲進視野——**jsdom 三個都沒有實作**。缺了之後下拉根本不展開，而錯誤訊息是「Unable to find an accessible element with the role "option"」，看起來像是選項寫錯或名稱不對，指不到真正的原因。

**How to apply**：補在 `apps/web/src/test/setup.ts`（一次補完，之後所有 Select / DropdownMenu 測試都受用）：

```ts
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.scrollIntoView = () => undefined;
```

同一類問題會出現在任何依賴瀏覽器互動 API 的 Radix 元件上。症狀一律是「找不到元素」而不是「API 不存在」。

### 2026-08-21 — 「補一個欄位」的正確位置取決於那張表為什麼沒有外鍵

**踩到什麼**：要讓檢舉列表帶出當事人 email，第一直覺是在 `PrismaChatReportRepository` 用 relation join——但 `chat_reports` 對 `members` **沒有外鍵**。

**Why**：那不是疏漏，是刻意的：檢舉必須在被檢舉者的帳號被刪除之後仍然可以審閱。在 repository 加 join 等於悄悄假設「這個人一定還在」，而 Prisma 的 relation 也需要 schema 上真的有關聯。

**How to apply**：**沒有外鍵的關聯，補值屬於 service 層**——收集本頁的 id、一次批次查、貼回結果，查不到就是 `null`。判準是問「這張表為什麼沒有外鍵」，答案通常直接指出補值該放哪一層。另外批次查要用**呼叫次數**斷言（`toHaveBeenCalledTimes(1)`），不要用「有沒有被呼叫」——N+1 在 15 筆測試資料上跑起來完全正常。

### 2026-08-22 — e2e 裡軟刪除「呼叫者自己」，症狀會偽裝成回應格式錯誤

**踩到什麼**：驗「對造帳號已刪除 → email 為 null」時，把檢舉人軟刪除——而檢舉人正是這支測試登入用的帳號。失敗訊息是 `Cannot destructure property 'list' of 'res.body.data' as it is undefined`，看起來像回應格式不對或端點壞了。

**Why**：軟刪除呼叫者 → 他的 token 在下一個請求就失效 → 回 401，而 401 的 body 沒有 `data`。**測試斷言的是 body 的形狀，而不是狀態碼**，所以真正的原因（授權失效）完全不會出現在錯誤訊息裡。

**How to apply**：e2e 要弄髒某個帳號時，先確認**它不是這支測試的登入身分**。挑對造時往「另一個方向」找——這個案例裡改成刪被檢舉人、從 `role=REPORTER` 的方向查，同樣驗到了同一件事。另外：斷言前先 `expect(res.status).toBe(200)` 能讓這類問題當場說出真正的原因，成本只有一行。

### 2026-08-22 — 兩份 spec 各自完整，合起來仍然有洞

**踩到什麼**：`ui-member-profile` 寫了「聊天室**清單**」，`api-moderation` 只定義了 `roomCount`。兩份文件各自讀起來都沒問題，直到前端要接資料才發現**沒有任何端點回那份清單**——而 admin 的 api-client 裡也沒有現成的（`/chat/rooms` 是前台的，兩邊的 swagger 是分開的）。

**Why**：前後端拆成兩支 spec 是對的（驗收方式不同），但拆開之後**沒有人負責檢查銜接**。這與 WS 撤銷連線那次是同一種形狀：每一層都正確，但沒有人負責銜接。

**How to apply**：寫完 `ui-*` spec 後，逐條把它要顯示的每一塊資料對回 `api-*` spec 的某個回應欄位。對不上的就是缺一支端點，**在寫程式之前就會發現**。這個檢查只要幾分鐘，而漏掉的代價是實作到一半才回頭補端點與 swagger。

### 2026-08-22 — 反向驗證「沒紅」有兩種意思，要分清楚是哪一種

**踩到什麼**：`messageCount` 用 `chat_rooms.last_seq` 而非 `count(*)`，反向驗證時把它換成 `count(*)`，預期 e2e 變紅——**結果全綠**。

**Why**：在「訊息列永遠不會被刪除」的前提下，`last_seq` 與 `count(*)` **本來就相等**。測試沒紅不是測試失效，是那兩個實作在目前的條件下真的等價。繼續往下試才找到測試真正守的東西：把 count 加上 `where: { removedAt: null }`（只算「還在的」）就會紅——它守的是**語意**（撤回與移除仍計入），不是資料來源。

**How to apply**：反向驗證沒紅時要先問「是測試看不見，還是這兩個實作真的等價」。等價的話，那個選擇就**沒有守則在守**，必須寫進 design.md 說清楚為什麼選它、以及什麼條件下差別才會顯現（這裡是「日後真的做了訊息清理」）。把「沒有守則」誤讀成「有守則」比沒有守則更危險。

同一個判準也適用於上一個 change：`listSelect` 多選 `contentSnapshot` 不會紅，因為投影函式擋在後面——那也是「真的擋住了」，不是「測試看不見」。

### 2026-08-22 — 守則的掃描器只認它當初見過的裝飾器

**踩到什麼**：加了第一支 SSE 端點（`@Sse('stream')`），`swagger-sync` 守則只抓到旁邊那支 `@Get()` 缺 yaml，**完全沒提到 SSE 那支**。補完 yaml 後它就綠了——而 SSE 端點其實還沒寫文件。

**Why**：掃描器的樣式是 `@(Get|Post|Patch|Put|Delete)\(`。`@Sse()` 也是一條 GET 路由，但它不在那個清單裡，所以對這條守則完全隱形。這是本專案第 N 次遇到同一種形狀：**規則本身沒錯，只是看不見新東西**（`layering` 只掃 `*Controller.ts`、`authorization-coverage` 看不到 WS、`includes()` 分不出使用與提及、限流守則注入即通過）。

**How to apply**：用 Nest 加入**新種類的路由裝飾器**（`@Sse`、`@All`、日後的自訂裝飾器）時，先去 `test/architecture/swagger-helpers.ts` 把它加進 `ROUTE_DECORATORS`，並在 `methodOfDecorator` 決定它對應哪個 HTTP method。更一般的判準：**任何守則只要靠「列舉已知形式」實作，加入新形式時就要同步更新它**——而那件事沒有任何東西會提醒你，因為守則會安靜地通過。

### 2026-08-22 — 中斷 prisma migrate 會留下 advisory lock，後續全部卡住

**踩到什麼**：`pnpm db:migrate -- --name X --create-only` 因為多帶了 `--` 而讓 prisma 沒收到 `--name`，卡在互動式提問。`pkill` 掉之後，接下來每一次 migrate 都失敗：`P1002 Timed out trying to acquire a postgres advisory lock`。

**Why**：`prisma migrate` 用 `pg_advisory_lock` 防止多個 migration 同時跑。advisory lock 是 **session 綁定**的，而被 kill 的 node 行程留下了一個 idle 的 Postgres 連線——鎖跟著那個連線留在原地，新的 migrate 只能等到逾時。

**How to apply**：兩件事。**(a)** `pnpm db:migrate --name X --create-only`，**不要加 `--` 分隔符**——加了會讓 prisma 把 `--name` 當成位置參數而轉入互動模式。**(b)** 真的卡住時，找出持有鎖的 orphan 連線再精準終止：

```sql
SELECT pid, granted FROM pg_locks WHERE locktype='advisory';   -- granted=t 的那個是元凶
SELECT pg_terminate_backend(<pid>);
```

不要整個重啟資料庫容器——那會影響其他正在用同一個 Postgres 的專案。

### 2026-08-23 — 測試可能正在釘住 bug，而不是釘住規格

**踩到什麼**：把登入的帳號鎖定改成丟 `AccountLockedException`（423，spec 明訂）之後，既有的單元測試紅了——它斷言的是 `ForbiddenException`（403）。也就是說 spec 寫 423、程式丟 403、**測試站在程式那邊**，三者不一致的狀態穩定存在了很久。

**Why**：測試是照著「當時的實作」寫的，不是照著 spec 寫的。一旦寫完，它就從「驗證規格」變成「凍結現況」——而凍結的如果是 bug，那個 bug 從此有了保護。`AccountLockedException` 一直存在、一直沒被用，也沒有任何東西會指出這件事。

**How to apply**：改動一個有 spec 的行為時，**先讀 spec 再讀測試**，順序不能反。測試紅了要先問「是我改錯了，還是它本來就在釘錯的東西」。另外：`openspec-spec-format.spec.ts` 驗的是 spec 的**格式**，沒有任何守則驗「spec 宣稱的狀態碼與實作一致」——這類漂移目前只能靠人在改到那段程式時發現。

### 2026-08-23 — partial mock 蓋不到模組對自己的呼叫

**踩到什麼**：`isSwaggerEnabled()` 內部呼叫同檔案的 `getEnv()`。測試用 `jest.mock` 搭 `requireActual` 只替換 `getEnv`，結果 mock 完全沒生效——`isSwaggerEnabled` 拿到的仍是真實的環境變數。

**Why**：CommonJS 下，模組內部的呼叫走的是**模組作用域裡的那個 binding**，不是 exports 物件上的屬性。替換 exports 只影響「別的模組怎麼看它」，不影響「它怎麼看自己」。

**How to apply**：把判定抽成**吃參數的純函式**（`resolveSwaggerEnabled(nodeEnv, explicit)`），讓包裝函式只負責取值。純函式沒有這個問題，而且測試讀起來就是一張真值表。這比研究怎麼讓 mock 生效便宜得多，順便讓那段邏輯可以被別處重用。

### 2026-08-23 — 驗「時區處理」的測試，本身不可以依賴機器時區

**踩到什麼**：`dashboard.e2e-spec.ts` 有一支測試專門驗「今日訊息數的日界依 `APP_TIMEZONE` 而非 UTC」。本機全綠，**CI 紅**：`Expected: 1, Received: 0`。

**Why**：測試用 `new Date(); setHours(0, 30, 0, 0)` 造時間戳，而 `setHours` 走的是**執行機器的本機時區**。我的機器本機時區剛好是 `Asia/Taipei`，所以算出來就是台北的凌晨；CI runner 是 UTC，算出來是 UTC 的凌晨，落在台北「今天」的界線（UTC 前一天 16:00）之前，於是不被計入。

諷刺的地方在這裡：**這支測試只有在「機器時區 == APP_TIMEZONE」時才會過，而那正是它要防的 bug 唯一看不見的情況**。它看起來在驗時區處理，實際上是在驗「兩個恰好相等的東西相等」。

**How to apply**：時間相關的測試要**明確在目標時區的框架下算時間戳**，不要用任何走本機時區的 API（`setHours` / `getHours` / `setDate` / `getDate` / `toLocaleString`）。台北是 UTC+8 且無日光節約，可以直接位移：

```ts
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const taipeiNow = new Date(Date.now() + TAIPEI_OFFSET_MS);
const taipeiMidnightUtc = new Date(
  Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate())
  - TAIPEI_OFFSET_MS,
);
```

**寫完用 `TZ=UTC pnpm ... test:e2e` 跑一次**——那是最便宜的 CI 條件重現，本機兩秒就知道測試有沒有偷偷依賴機器時區。「N 小時前」這類相對時間也要小心：`setDate(getDate() - 1)` 在有日光節約的機器上可能只退 23 小時，用 `Date.now() - 26h` 這種明確位移比較安全。

**補充：這支測試在引入它的那個 PR 上，CI 是綠的。** 它不是「在 CI 上一定紅」，而是「一天之中只有某幾個小時會紅」——UTC 16:00 之後台北已跨到隔天，`setHours(0,30)` 算出的 UTC 今天凌晨才會落到台北今天的界線之前。引入時 CI 跑在 UTC 白天，剛好在界線之後，於是通過。

也就是說**時區測試的錯誤是一顆定時炸彈，而不是一個穩定的紅燈**——它會在某個不相干的 PR 上引爆，然後那個 PR 的作者去查一個不是他造成的問題。這讓「寫完立刻 `TZ=UTC` 跑一次」的價值比看起來更高：那是唯一能在引入當下就發現的時機。
