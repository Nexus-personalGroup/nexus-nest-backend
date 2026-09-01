> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **但這個 change 的主體是 compose 與 nginx 設定，那三個指令幾乎驗不到它**
> ——真正的驗證是**實際起容器打上去看**。每一塊的驗收都寫成可執行的 curl。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
>
> **塊的依賴**：兩塊互相獨立，可任意順序。
> **1.1 與 1.2 必須同一個 commit**——加了 nginx 卻沒設 `TRUST_PROXY` 會讓
> IP 黑名單、登入失敗計數、全域節流三個功能同時靜默失效（design D1）。
>
> **每塊綠燈後給一次 commit 指令，由使用者手動執行**，再進下一塊。
>
> **這個 change 沒有 schema 變動、沒有 migration、沒有新的應用程式環境變數。**

## 1. nginx 反向代理

- [x] 1.1 `docker/nginx/default.conf`：`/api` → `api:3000`、`/` → `web:5173`。
      兩段都要 `proxy_set_header` 帶 `Host` / `X-Real-IP` /
      `X-Forwarded-For` / `X-Forwarded-Proto`
- [x] 1.2 ⭐ **同一個 commit** 設 `TRUST_PROXY: '1'`（信任一層代理）。
      **不可用 `true`**——那會無條件採信整條 XFF 鏈，等於讓任何人偽造來源 IP
      （`backend-runtime.md` 已寫著「切勿設 `true`」）
- [x] 1.3 ⭐ WebSocket upgrade：`proxy_set_header Upgrade $http_upgrade` +
      `Connection "upgrade"` + `proxy_http_version 1.1`。
      **驗收時發現需要三段不是兩段**：`setGlobalPrefix('api')` 只作用於 Nest 路由，
      **Socket.IO 掛在 `/socket.io/`**，原本被 `location /` 送去 Vite——
      而 Vite 回 200 讓它看起來像成功。已補 `location /socket.io`。
      證據：`:3000/api/socket.io/` 回 404、`:3000/socket.io/` 回 400（Socket.IO 本人）
- [x] 1.4 ⭐ 設定檔裡**明寫「不得加任何安全標頭」的禁令與理由**（design D3）：
      後端 helmet 已負責，CSP 更是分路徑的，代理層加一份會整個蓋掉。
      不寫的話下一個人照 Kgie 抄就會把它加回來
- [x] 1.5 compose 加 `nginx` 服務：官方 `nginx:alpine` + 掛設定檔（**不自建映像**），
      對外 `${APP_PROXY_PORT:-8080}`，`depends_on: api, web`
- [x] 1.6 ⭐ api / web 既有的對外埠**保留不動**——反向代理是多一條路不是取代
- [x] 1.7 驗收（起容器實際打）：
      ```bash
      pnpm docker:up
      curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/health   # 200
      curl -sI http://localhost:8080/api/health | grep -i content-security-policy  # 有，且來自後端
      curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/             # 200（Vite）
      curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health   # 200（直連仍可用）
      ```
- [x] 1.8 ⭐ **來源 IP 的驗收**——這是 1.2 唯一驗得到的地方：
      經由代理打一次帶 `X-Forwarded-For: 203.0.113.9` 的請求，
      確認應用程式看到的是那個 IP 而非容器位址
      （可用連續打錯密碼觀察 `nest:failed-ip:*` 的 key 名）
- [x] 1.9 ⭐ 反向驗證：
      (a) 拿掉 `TRUST_PROXY` → 1.8 要看到容器位址而非轉發的 IP；
      (b) 拿掉 WS upgrade 那三行 → 前端 HMR 要斷；
      (c) 在設定檔加一行 `add_header Content-Security-Policy "default-src 'self'"`
      → `/api/admin/docs` 的 CSP 會從「無」變成有，那正是被蓋掉的證據。
      三者還原後都要恢復
- [x] 1.10 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0
      （動到 compose 也跑一次 `pnpm build`）

## 2. e2e 在容器內執行

- [x] 2.1 compose 加 `e2e` 服務，`profiles: [e2e]`：沿用 `x-app-base`
      （同一個 dev 映像與 node_modules volume），
      `depends_on: postgres-verify（condition: service_healthy）`
- [x] 2.2 ⭐ **複用 `postgres-verify`，不另建**（design D6）——
      兩份定義會各自漂移，而症狀是「兩種跑法結果不同」
- [x] 2.3 ⭐ DB 連線由 compose 的 `environment` 提供，**`DB_TEST_DATABASE` 必須給**
      且名稱含 `test`：`applyE2EDbEnv()` 的守門會直接拋出。
      容器內 `apps/api/.env` 是被遮蔽的空檔，dotenv 只能補值不能當唯一來源
- [x] 2.4 ⭐ `globalSetup` 的建庫與 `prisma migrate deploy` **不需要改動**——
      它讀 `process.env` 的 `DB_*`。確認這一點，不要順手改它
- [x] 2.5 包裝腳本：`docker compose --profile e2e run --rm e2e`，
      收尾放 `trap ... EXIT`。
      ⚠️ **不可沿用 `verify-ci.sh` 的 `down -v`**——`-v` 移除的是**專案的所有
      named volume**（`postgres-data` / `redis-data` / 五個 `node_modules`），
      跑一次就清掉開發環境。**驗收時真的踩到了**，且發現
      `verify-ci.sh` 一直有同樣的 bug，一併改成 `rm -fsv <服務>`
- [x] 2.6 ⭐ **失敗時也要清乾淨**（design D7）：失敗才是最需要重跑的時候，
      殘留資料會讓下一次的結果不可信。且指令要以**非零碼**結束
- [x] 2.7 `package.json` 加 `test:e2e:docker`
- [x] 2.8 ⭐ **既有的 `pnpm --filter @app/api test:e2e` 不動**——
      host 跑是最快的迭代路徑，兩者是不同用途不是取代
- [x] 2.9 驗收：
      ```bash
      pnpm test:e2e:docker            # 全綠，結束後 docker compose ps 看不到殘留
      docker volume ls | grep verify  # 應無殘留
      ```
- [x] 2.10 ⭐ 反向驗證：故意讓一支 e2e 失敗 →
      指令要以非零碼結束**且容器仍被清掉**。還原後綠

## 3. 收尾

- [x] 3.1 跑完整驗證鏈並**貼出實際 exit code**
- [x] 3.2 README + `openspec/project/tooling.md`：指令表加
      `test:e2e:docker`，compose 用法從三種改成四種，
      並寫明**三個入口各自的用途**（nginx 單一 origin / api / web 直連）
- [x] 3.3 ⭐ `openspec/project/backend-runtime.md` 補一段：
      **反向代理之後 `TRUST_PROXY` 必須設**，以及三個會靜默失效的功能。
      那份文件已有 `TRUST_PROXY` 的說明，但沒有「什麼時候必須改」
- [x] 3.4 更新 `tasks/todo.md`：路線圖加這個 change
- [x] 3.4b ⭐ **順手掃了 README / CLAUDE.md / openspec/project 的過期敘述**（使用者要求），
      找到六處：守則數量兩處、規則表漏 10 支、`frontend.md` 整節在建議
      change 7 已完成的事、`tooling.md` 的「三種用法」與「跑完即 down -v」、
      refresh 效期「7 天」。並補上 `guardrail-inventory` 的兩個缺口
      （樣式不認「N 支 / M 項斷言」、掃描範圍沒有 README），
      再新增一條「規則表必須涵蓋每一支守則」——那張表靠自律維護已經漏了 10 支
- [x] 3.5 新踩到的坑寫進 `tasks/lessons.md`
- [x] 3.6 ⭐ **列出需要使用者手動執行的**：`pnpm docker:up` 重建容器
      （`environment` 的變更不會被 restart 套用）
- [x] 3.7 `openspec archive add-nginx-proxy-and-containerised-e2e`，
      並檢查 `platform-container-dev` 的 `## Purpose` 有沒有跟新的 Requirements 打架
