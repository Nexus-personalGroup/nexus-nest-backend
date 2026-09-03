> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **主要驗證在實機**——這支改的是容器的設定來源，單元測試碰不到。步驟在第 3 塊。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：1 → 2 依序（守則在釘死之後才會綠）。第 3 塊要前兩塊都完成。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、前端變更。**

## 1. compose：釘死連線類變數並讀入 host 的 .env

- [x] 1.1 api 服務加 `env_file: - path: ./apps/api/.env` + `required: false`
      ——⭐ **`required: false` 不可省**：沒有 `.env` 的機器（CI、剛 clone）
      會直接起不來
- [x] 1.2 ⭐ 釘死 `REDIS_URL: ''`——**空字串是關鍵**：連線工廠是
      `env.REDIS_URL ? url : {host, port}`，falsy 才會走回已釘死的 HOST/PORT。
      釘成任何非空值都會蓋掉 `REDIS_HOST: redis`
- [x] 1.3 釘死 `SMTP_HOST: ''` 與 `SMTP_PORT: '587'`
      ——本機 mail catcher 的位址在容器內連不到
- [x] 1.4 ⭐ 釘死 `API_BASE_URL: http://127.0.0.1:${APP_PROXY_PORT:-8080}`。
      **這順帶修一個潛伏 bug**：預設值 `localhost:3000` 在
      `enforce-single-entry-container` 關掉 api 對外埠之後已經連不到，
      容器模式產生的驗證信連結目前是壞的
- [x] 1.5 ⭐ 註解要寫**為什麼保留遮蔽掛載**：兩個檔的讀者不同
      （`docker/api.container.env` 是隊友共用基準、`apps/api/.env` 是個人偏好）
- [x] 1.6 `docker compose config` 驗證語法

## 2. 守則：連線類變數必須釘死

- [x] 2.1 新增守則：`envSchema` 中 `_HOST` / `_PORT` / `_URL` 結尾的變數
      必須出現在 compose 的 api `environment:`
- [x] 2.2 ⭐ 豁免清單含 `APP_FRONT_URL` / `APP_PASSWORD_RESET_URL` /
      `LOCAL_MEDIA_BASE_URL`，**每一個都要寫理由**
      ——沒有豁免機制的規則會被整條關掉
- [x] 2.3 ⭐ 豁免清單有過期項目（變數已不存在）也要紅
- [x] 2.4 ⭐ 斷言掃描範圍有效：`envSchema` 與 compose 的 api `environment:`
      都要讀到非空集合，掃不到就失敗
- [x] 2.5 ⭐ **反向驗證**：把 `REDIS_URL` 從 compose 拿掉 → 紅；
      在豁免清單加一個不存在的變數 → 紅；還原 → 綠。確認紅的是這一支
- [x] 2.6 `openspec/project/testing.md` 的守則表補一列
- [x] 2.7 ⭐ 追加守則：`env_file` **不得放進 `x-app-base`**——放上去會讓
      `--profile e2e` 的服務也讀進本機 `.env`，而那條路徑的目的正是密封。
      含掃描範圍斷言（錨點改名 → 紅）。兩邊都反向驗過，紅的都是這兩條

## 3. 實機驗收

- [x] 3.1 `pnpm docker:down && pnpm docker:up`——五個容器全 Healthy
- [x] 3.2 ⭐ **compose 有設的贏**：容器內 `DB_HOST=postgres`
      （本機 `.env` 是 `127.0.0.1`）
- [x] 3.3 ⭐ **compose 沒設的吃 host**：`APPLICATION_ACCOUNT_LOCK_ENABLED=true`
      有進到容器
- [x] 3.4 ⭐ **REDIS_URL 不會繞過釘死**：從 `env_file` 餵
      `REDIS_URL=redis://localhost:6379`，容器內讀到 `''`、`REDIS_HOST=redis`，
      且 `/api/health/ready` 回 `redis: up`——**不只是變數是空的，是實際連得上**
- [x] 3.5 沒有 `apps/api/.env` 時容器仍能啟動——用 compose 複本兩邊驗：
      `required: false` + 缺檔 → exit 0；`required: true` + 缺檔 → exit 1
      （後者證明這個檢查不是空的）
- [x] 3.6 `API_BASE_URL=http://127.0.0.1:8080`，經代理打 `/api/health` → 200
- [x] 3.7 `pnpm --filter @app/api test:e2e` → **417/417 passed**
      （須 `APPLICATION_SESSION_IDLE_ENABLED=false`，原因見下方「驗收時發現的兩件事」）

### 驗收時發現的兩件事（都不是本 change 造成的，但都由它觸發）

**① `@Public()` 擋不住 IP guard，健康檢查被 ACL 擋掉**

`apps/api/.env` 開 `APPLICATION_IP_WHITELIST_ENABLED=true` 且 `ip_whitelist` 為空時，
guard fail-closed → 每個請求 403 → **healthcheck 也 403** → 容器 unhealthy →
nginx 的 `depends_on: service_healthy` 永不滿足 → 整組起不來。

`HealthController` 已標 `@Public()` + `@SkipThrottle()`，但 `@Public()`
**只有 `JwtAuthGuard` 認**，兩支 IP guard 不讀 metadata。
正式環境同形：開白名單 → k8s liveness probe 403 → CrashLoopBackOff。

**② e2e 會吃開發者整份 `.env`**

`test/helpers/e2e-env.ts` 的 `config({ path: apps/api/.env })` 載入的是**整份檔案**，
不是 TSDoc 寫的「連線帳密」。所以 `.env` 的功能開關全數漏進 e2e。
兩邊驗證：`APPLICATION_SESSION_IDLE_ENABLED` 為 true → **183 failed**；
強制 false → **417 passed**。
失敗訊息是「Session 已因閒置過久而過期」，指不到真正的原因。

## 4. 收尾

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠（三個都 exit 0）
- [x] 4.2 `openspec validate improve-container-env-precedence --strict` → exit 0。
      ⚠️ `validate --specs --strict` 是 **7 支紅**，但**全部是既有狀態**
      （`openspec/specs/` 本次未修改，錯誤是 requirement 缺 SHALL/MUST）——
      已記進 `tasks/todo.md`，不在本 change 處理
- [ ] 4.3 `apps/api/.env.example` 檔頭更新：容器模式現在**會**讀本檔，
      但連線類由 compose 釘死——原本寫的「Docker 開發不讀本檔」已不正確
      **（權限擋住，走無點暫存檔由使用者套用）**
- [x] 4.4 `docker/api.container.env` 檔頭更新：說明它與 `apps/api/.env` 的分工
      （共用基準 vs 個人偏好）+ ⚠️ 共用基準在三者中**優先序最低**
- [x] 4.5 `README.md` 與 `openspec/project/tooling.md` 的「只有兩個來源」同步為四層優先序
- [x] 4.6 `tasks/lessons.md`：補「保護的對象要收斂到真正會壞的那些，
      擋過頭的保護會讓人繞過它」
- [ ] 4.7 `openspec archive improve-container-env-precedence`
