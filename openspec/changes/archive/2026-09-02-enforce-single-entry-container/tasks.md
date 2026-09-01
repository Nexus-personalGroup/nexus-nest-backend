> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **但那三個指令驗不到「埠是不是真的關了」**——真正的驗收是
> `docker compose up -d --build --wait` 之後實際去連（第 3 塊）。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
>
> **塊的依賴**：第 2 塊的守則在第 1 塊完成前會是紅的（compose 還有 `ports:`），
> 必須照順序。第 3 塊要前兩塊都完成。
>
> **這個 change 沒有 schema、migration、新環境變數、API 變更、前端變更。**

## 1. 關閉 api / web 的對外埠並同步文件

- [x] 1.1 `compose.yml`：api 服務移除 `ports:` 區塊
- [x] 1.2 `compose.yml`：web 服務移除 `ports:` 區塊
- [x] 1.3 ⭐ `compose.yml`：`CORS_ORIGIN` 從 `http://localhost:${APP_WEB_PORT:-5173}`
      改為代理的 origin，**`127.0.0.1` 與 `localhost` 兩個都列**（見 design D4）。
      註解要寫出「容器模式從此同源，CORS 只由 host 模式覆蓋」——
      不寫的話下一個改 CORS 的人會在容器裡改了看不到差別而以為沒生效
- [x] 1.4 `compose.yml`：檔頭註解的「三種用法」段落補上「容器模式只有代理一個入口」；
      nginx 服務上方那句「api / web 原本的埠仍然可用」改掉
- [x] 1.5 ⭐ **刪掉 `APP_API_PORT` / `APP_WEB_PORT`**（見 design D5）——
      移除 `ports:` 後沒有使用者，留著就是「設了不會有效果」的變數
- [x] 1.6 `docker/nginx/default.conf` 檔頭：「api / web 原本的對外埠**仍然可用**
      ——這是多一條路，不是取代」整段改寫成單一入口的敘述
- [x] 1.7 `README.md`：「三個入口」表改成單一入口，並補上
      **要直連請改用 host 模式**、以及 D2 那條從代理容器內部打後端的除錯指令。
      同步第 94–95 行的可覆寫變數清單（拿掉 `APP_API_PORT` / `APP_WEB_PORT`）
- [x] 1.8 `openspec/project/tooling.md`：第 86 行的 nginx 段落與第 103 行的
      變數清單同步
- [x] 1.9 驗證：`pnpm test` 綠（`compose-files.spec.ts` 的「對外埠必須寫進 README」
      這條在埠變少之後仍須通過）

## 2. 守則：api / web 不得宣告對外埠

- [x] 2.1 `compose-files.spec.ts` 新增一條 `it`：解析 `compose.yml`，
      斷言 api 與 web 兩個服務底下沒有 `ports:`
- [x] 2.2 ⭐ **同時斷言「掃描範圍有效」**——確認真的抓到了 api / web 兩個服務區塊。
      抓不到就失敗，否則服務改名之後這條規則會靜默空轉（見 spec 的第二個 scenario）
- [x] 2.3 ⭐ 訊息要指出替代路徑（host 模式），不只是說「不准」——
      這條守則會擋到的人正是「想直連做點事」的人，訊息不給替代方案只會讓人繞過它
- [x] 2.4 ⭐ **反向驗證**：把 `ports:` 加回 api → `pnpm --filter @app/api test:arch`
      必須紅；拿掉 → 必須綠。**兩邊都要看 exit code**
- [x] 2.5 ⭐ **反向驗證掃描範圍**：把 compose 的 `api:` 改名成別的 → 必須紅
      （而不是「掃不到所以通過」）；改回 → 綠
- [x] 2.6 `guardrail-inventory.spec.ts` 若有數量斷言需同步

## 3. 實機驗收（容器）

- [x] 3.1 `pnpm docker:down && pnpm docker:up` → 五個服務起來，
      `docker compose ps` 的 PORTS 欄只剩 nginx / postgres / redis
- [x] 3.2 ⭐ `curl http://127.0.0.1:5173` → `000`（connection refused）。
      **`:3000` 沒有得到 connection refused，但不是我們的容器**——host 上另一個專案
      （`kgie-nest-backend`）綁在 `*:3000`，回的是它的 404。
      **判準因此改看 `docker compose ps` 的 PORTS 欄**（api 是空的）：
      用 curl 判斷「埠關了沒」在別的行程也可能佔用同一個埠時會得到錯的結論
- [x] 3.3 `curl http://127.0.0.1:8080/api/health` → 200
- [x] 3.4 瀏覽器開 `http://127.0.0.1:8080` → 沿用既有 session 直接進後台，
      `/me` 與 `/moderation/dashboard` 都經代理取得資料（cookie 同源成立）。
      **未執行登出後重新輸入密碼的完整登入**——不代入密碼是工具層的限制，
      而既有 session 已經證明 cookie 與 API 都通得過代理
- [x] 3.5 ⭐ Swagger `/api/admin/docs` → 301 → `/api/admin/docs/` → 200。
      導向用的是**相對路徑**，不會外洩容器內部的 3000
- [x] 3.6 ⭐ HMR：console 有 `[vite] connected.`；改 `home/page.tsx` 後出現
      `[vite] hot updated: /src/routes/home/page.tsx`（探針已還原，`git diff` 乾淨）
- [x] 3.7 ⭐ Socket.IO 路由正確：`/socket.io/?EIO=4` → **400**（打到 Socket.IO
      handler），`/api/socket.io/?EIO=4` → **404**（打到 Nest 路由）。
      **只驗到協定層**——`apps/web` 是後台、沒有 socket.io client，
      沒有任何後台畫面會開聊天連線，UI 層無從驗起
- [x] 3.8 `docker compose exec nginx wget -qO- http://api:3000/api/health`
      → `{"success":true,...,"status":"ok"}`，README 那條除錯指令可用

## 4. 收尾

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.2 `openspec validate enforce-single-entry-container --strict` 通過
- [x] 4.3 `tasks/todo.md`：記入 design 的 Risks 提到的
      **api 沒有 healthcheck、`--wait` 只等到 running** ——本 change 不修
- [x] 4.4 `tasks/lessons.md`：補「『埠關掉了沒』不能用 curl 判斷，
      要看 `docker compose ps` 的 PORTS 欄」——3.2 實際踩到
- [x] 4.5 `openspec archive enforce-single-entry-container`
