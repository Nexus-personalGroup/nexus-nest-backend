> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **第 2 塊（nginx）驗不到於單元測試**——要實機起容器確認，指令在 2.5。
> **第 1 塊動到 `main.ts`，要跑 `pnpm --filter @app/api test:e2e`。**
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：四塊互相獨立，可任意順序。
>
> **這個 change 沒有 schema、migration、API 契約、新權限碼變更。**

## 1. 註解與日誌的小修

- [x] 1.1 `unassignable-permissions.ts:14`：`unassignable-permissions.spec.ts`
      → `permission-catalog-sync.spec.ts`
- [x] 1.2 `permission-labels.ts:7`：`permission-labels.spec.ts`
      → `permission-catalog-sync.spec.ts`
- [x] 1.3 ⭐ 順手確認那兩條規則**真的在該檔裡**（雙向比對 / `@Roles` 檢查）
      ——改檔名而不確認內容，只是把錯誤換一個位置
- [x] 1.4 `main.ts:208-215`：兩行 Swagger 網址日誌包進 `if (isSwaggerEnabled())`
- [x] 1.5 `ChatGateway.exceedsLimitAfterWrite` 補一行註解：排序鍵 `lastSeenAt`
      是「上次心跳」而非「連線建立時間」，兩者等價**依賴心跳是整批同時寫的**
      ——哪天心跳改成錯開送出，排序與連線年齡的對應會鬆掉，
      而症狀是上限偶爾多一條，不會有東西失敗（審查報告問題 4）
- [x] 1.6 `pnpm --filter @app/api test:e2e` 全綠（動到 `main.ts`）

## 2. nginx：條件式 upgrade 與「哪些不該對外」

- [x] 2.1 在 `server` 之外加 `map $http_upgrade $connection_upgrade`
      （`default upgrade;` / `'' close;`）
- [x] 2.2 三個 `location` 的 `proxy_set_header Connection` 改用 `$connection_upgrade`
- [x] 2.3 ⭐ 註解要寫**為什麼現在改**：目前沒有 `keepalive` 所以無症狀，
      但那正是它危險的地方——加了 keepalive 之後會安靜地不生效
- [x] 2.4 ⭐ 檔頭補「哪些不該從外面進來」（`/api/metrics`、`/api/*/docs`）。
      **只加註解不加封鎖**：dev 需要打得到 Swagger（見 design D2）
- [x] 2.5 ⭐ 實機驗收：`pnpm docker:down && pnpm docker:up`
      → 代理 `/api/health` 200、Swagger 打得開、**HMR 仍然連得上**
      （`map` 寫錯位置 nginx 會直接啟動失敗，這一步會立刻顯現）
- [x] 2.6 ⭐ 反向驗證 upgrade 仍然有效：確認 console 有 `[vite] connected.`
      ——`Connection` 改成條件式最可能的壞法就是把升級一起關掉

## 3. `VERIFY_DB_PORT` 與根目錄環境檔

- [x] 3.1 `compose.yml` 的 `postgres-verify`：`15432` → `${VERIFY_DB_PORT:-15432}`
- [x] 3.2 ⭐ `scripts/verify-ci.sh` **改成問 compose 實際開了哪個埠**
      （`docker compose port postgres-verify 5432`），而不是自己組或解析 `.env`。
      第一版寫成 `. ./.env` 被自己否決——sourcing env 檔遇到含空白的值會爛，
      而「問實際狀態」是唯一不可能漂移的做法
- [x] 3.3 新增根目錄 `.env.example`：列出 compose 讀的六個變數，
      檔頭寫明與 `apps/api/.env` 的分工與「改埠要成對改」
- [x] 3.4 `README.md` 的可覆寫變數清單補上 `VERIFY_DB_PORT`，並指向 `.env.example`
- [x] 3.5 ⭐ `compose-files.spec.ts` 的「對外埠必須寫進 README」須維持綠
      （新的 `${VERIFY_DB_PORT:-15432}` 仍會被解析出 15432）
- [x] 3.6 驗證：`pnpm verify:ci` 印出「DB 埠 15432」且全綠。
      ⚠️ **第一次跑遇到那個間歇性 e2e 失敗（第 9 次）**，重跑 417 全過。
      不是本次改動造成的，但**留下了迄今最有用的證據**：登入回的是 `401`，
      不是回應格式壞掉。已記進 todo 的「觀察中」

## 4. `testing.md` 兩節與收尾

- [x] 4.1 新增「兩種驗證手段的守備範圍」一節：表格 + 判準
      （錯的是「兩處不一致」還是「值本身」）
- [x] 4.2 ⭐ 與既有的「測不到的形狀：送到系統外面去的字串」**互相指向**
      ——各自存在的話，讀到其中一節的人不會知道另一半
- [x] 4.3 新增「動到模組接線必須跑 e2e」：`pnpm build` 綠不代表 DI 組得起來，
      附兩次實例（`METRICS_PORT` 注入、`ChatWsModule` 的 exports）
- [x] 4.4 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.5 `openspec validate --specs --strict` 通過
- [x] 4.6 ⭐ `tasks/todo.md`：把審查報告的**問題 1**（營運快照無界 count）
      記進「技術債」，並寫明**先加觀測再選方案**——
      不記的話它會變成下一個「知道但沒人動」
- [x] 4.7 `tasks/todo.md`：記入審查結果（0 個 🔴、綜合 9.0）
- [x] 4.8 `tasks/lessons.md`：本次沒有新坑（`. ./.env` 那個在寫的當下就否決了，
      沒有真的踩下去），不寫
- [x] 4.9 `openspec archive fix-review-followup-cleanup`
