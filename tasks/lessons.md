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

### 2026-08-20 — openspec 的 MODIFIED 靠「標題字串」比對，改標題會讓封存整個中止

**踩到什麼**：delta spec 用 `## MODIFIED Requirements`，把需求標題從「品質檢查必須在 Merge Request 階段執行」改成「…Pull Request…」，內容也一併更新。`openspec validate` **通過**，但 `openspec archive` 失敗：

```
platform-ci-quality-gate MODIFIED failed for header "### Requirement: 品質檢查必須在 Pull Request 階段執行" - not found
Aborted. No files were changed.
```

**Why**：MODIFIED 是拿 delta 的 `### Requirement:` 標題去 master spec 裡找同名那塊來取代。標題一改就找不到目標。而 `validate` 只檢查 delta 自身的格式合不合法，**不會拿去跟 master spec 對照**——所以「validate 綠 + archive 紅」是這個工具的正常行為，不是壞掉。

**How to apply**：需求要改名就用 `## RENAMED Requirements`（`- FROM:` / `- TO:` 各一行，值是完整的 `### Requirement: <名稱>`）。改名**又**改內容時兩段都要寫，MODIFIED 那段用**改名後**的標題。archive 輸出會顯示 `→ 1 renamed` 確認生效。順帶注意改名後的需求會被移到 master spec 的**末尾**，不留在原位置。

**還好的一點**：archive 失敗時是 `Aborted. No files were changed.`——它不會做到一半留下半套的 master spec。

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
