## Context

參考了 `Kgie-Group/docker-kgie-nest-backend` 的做法。那是一個**獨立的部署基礎設施 repo**：
映像由 CI 建好推 registry，部署時 SSH 到測站主機 clone 它、拉映像、`compose up`。
拓撲是 nginx（17081）→ nodejs-app（3000）→ redis，資料庫是外部 MSSQL。

**它的多數結構不適用於 nexus**，理由見 D5。真正值得帶過來的只有兩點：
nginx 當單一入口的形狀，以及**「安全標頭交給後端、代理不重複加」**這個判斷
（Kgie 的 `default.conf` 註解裡寫著）。

順帶一提：**Kgie 沒有容器化的 e2e**——它連外部 `TEST_DATABASE_URL`。
那一塊是 nexus 自己要往前走的。

## Goals / Non-Goals

**Goals:**

- 開發時有一個與正式部署同形狀的單一 origin。
- 反向代理不破壞既有的 IP 判斷與安全標頭。
- e2e 的測試行程可以完全跑在容器內，跑完不留東西。

**Non-Goals:**

- **不做 TLS 終結**（見 D4）。
- **不讓 nginx 直接吐靜態檔**（見 D2）。
- **不做 production 映像與部署流程**——`Dockerfile` 目前只有 `dev` target，
  註解明寫「刻意不含 production target：沒有被任何指令使用、也沒被驗證過的
  建置階段，就是本專案反覆踩到的『設定寫了但沒有執行路徑』」。本 change 不推翻它。
- **不分出獨立的基礎設施 repo**（見 D5）。
- **不取代既有的 host e2e**——那是最快的迭代路徑。

## Decisions

### D1：`TRUST_PROXY` 必須與 nginx 同時進來

這是本 change **唯一會靜默弄壞既有功能**的地方，因此放第一條。

`TRUST_PROXY` 預設 `'loopback'`——不採信外部的 `X-Forwarded-For`。
加了 nginx 之後 `request.ip` 會變成 nginx 容器的位址，而三個功能都讀它：

| 功能 | 壞掉的樣子 |
| --- | --- |
| IP 黑名單 | 擋不到真正的來源；一旦誤封就是封掉整個 nginx |
| 前台登入的失敗計數 | 所有人算成同一個，第 5 次失敗把全部人擋掉 |
| 全域節流 | 100 次／分鐘變成**全站共用**一份額度 |

**三個都不會報錯。** 它們照常運作，只是判斷的對象全錯了。

容器內設 `TRUST_PROXY: '1'`（信任一層代理）而非 `true`——
後者無條件採信整條 XFF 鏈，等於讓任何人偽造來源 IP。
`backend-runtime.md` 已經寫著「**切勿設 `true`**」。

### D2：nginx 只做轉發，不吐靜態檔

開發時 web 是 Vite dev server，靜態檔根本不存在（沒有 `dist`）。
要讓 nginx 吐就得先 build，那會**直接殺掉 HMR**——而 HMR 是開發容器存在的理由之一。

正式的單一埠部署是 API 用 `ServeStatic` 吐 SPA。若日後改成 nginx 吐，
那是**部署拓撲的變更**，該跟 production 映像一起評估，不該在開發環境先偷跑一半
——兩套機制同時存在而只有一套被使用，正是這個專案一直在避免的東西。

### D3：安全標頭一律不加

Kgie 的 `default.conf` 加了 CSP，因為**它的後端刻意停用 CSP**（Vite SPA 有 inline style）。
nexus 上一個 change 剛把 CSP 改成**分路徑**：`/api/admin/docs` 與 `/api/front/docs`
放寬、其餘套 helmet 預設，而且那個豁免範圍是由 `SWAGGER_SIDES` 單一來源決定的。

代理層再加一份會覆蓋掉整個判斷，**而且兩邊都不會失敗**——
症狀是「Swagger UI 打不開」或「後台某個資源被擋」，沒有人會想到是 nginx。

因此設定檔裡要**明寫這條禁令**，否則下一個人照 Kgie 抄的時候會把它加回來。

### D4：不做 TLS

開發環境沒有 TLS 的使用者需求，而自簽憑證會讓每個開發者的瀏覽器都跳警告。
真正需要 TLS 的是正式部署，那時的終結點通常在更前面（雲端的 LB / Ingress），
不會是這個 compose 裡的 nginx。**現在做等於做一個不會被用到的設定。**

### D5：不分獨立 repo，nginx 設定放 `docker/nginx/`

Kgie 分開的三個理由，nexus **一個都不成立**：CI 要 SSH 到測站主機 clone
（nexus 沒有部署目標）、映像從 registry 拉（沒有 registry）、
基礎設施與應用的發布節奏不同（同一個 monorepo、同一條 CI）。

現在分開只會多一個要保持同步的地方，而**同步失敗沒有徵兆**——
compose 引用的變數名改了、另一邊沒跟上，只有部署當下才會發現。

日後真要部署，分 repo 也不是必要條件：monorepo 開 `deploy/`、
CI 用 sparse checkout 抓那個路徑即可。真正逼你分開的是
「基礎設施要給多個應用共用」或「兩邊權限要分開」，兩者都還沒發生。

**同理不自建 nginx 映像**：Kgie 自建是為了塞 logrotate + crond。
nexus 用官方 `nginx:alpine` 掛設定檔就夠，多一個 Dockerfile 就多一個要維護的東西。

### D6：e2e 容器複用 `postgres-verify`，不另建

`--profile verify` 已經有一個 tmpfs 的 PostgreSQL，而且 `verify-ci.sh`
已經有 `trap ... EXIT` 的收尾。**另建一份會有兩個定義各自漂移**，
而漂移的症狀是「兩種跑法結果不同」——那正是容器化 e2e 想消除的東西。

`globalSetup` 的建庫與 `prisma migrate deploy` **不需要任何改動**：
它讀的是 `process.env` 的 `DB_*`，而那些由 compose 提供。

連線設定走 compose 的 `environment` 而非 `apps/api/.env`——後者在容器內是被遮蔽的。
`applyE2EDbEnv()` 用 dotenv 讀那個檔案來補值，而 **dotenv 不覆寫既有的 `process.env`**，
所以 compose 給的會贏；讀不到檔案也不影響，它只是補值不是唯一來源。
但 `DB_TEST_DATABASE` **必須由 compose 給**，否則那支的守門會直接拋出。

### D7：`run --rm` 而非 `up`，收尾放 `trap`

`run --rm` 讓退出碼直接是測試的退出碼——CI 與本機都靠它判斷成敗。
`up` 之後還要另外撈容器的退出碼，多一層容易寫錯。

清理放 `trap ... EXIT` 而不是指令末尾：**失敗才是最需要重跑的時候**，
而殘留的資料會讓下一次執行的結果不可信。這一點沿用 `verify-ci.sh` 的既有做法。

## Risks / Trade-offs

- **[加了 nginx 但忘了 `TRUST_PROXY`]** → 這是本 change 最大的風險，
  且失敗是靜默的。因此 spec 有一條專門的 scenario，實作時兩者必須同一個 commit。
- **[開發者不知道該用哪個入口]** → 三個埠同時開著（api / web / nginx）。
  README 要明寫「單一 origin 用 nginx 那個，其餘兩個是既有用法」。
- **[容器化 e2e 比 host 慢]** → 刻意保留兩條路徑。快的給開發時用，
  慢而密封的給「推上去之前」用。
- **[nginx 設定日後被加上安全標頭]** → 只能靠設定檔裡的註解擋。
  考慮過寫守則，但那要解析 nginx 設定語法，成本與收益不成比例（對照
  上一個 change 對「對外 URL 斷言守則」的同一個判斷）。

## Migration Plan

無 schema 變動、無資料遷移、無新的應用程式環境變數。

`compose.yml` 改動後需 `pnpm docker:up` 重建容器
（`environment` 的變更不會被 restart 套用）。

回滾：兩塊各自獨立，任一塊可單獨 revert。
