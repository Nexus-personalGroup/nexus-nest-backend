## Why

兩件各自獨立、但都是「容器環境還差最後一段」的事。

**① 開發時 api 與 web 是兩個 origin。** `localhost:3000` 與 `localhost:5173`
靠 Vite proxy 串起來，而正式的單一埠部署是**同一個 origin**（API 用
`ServeStatic` 吐 SPA）。兩種拓撲不一樣，代表 CORS、cookie 的
`SameSite`、以及剛做完的 CSP 分路徑，**在開發時走的都不是上線時那條路**。

**② e2e 的測試行程跑在 host 上。** 資料庫已經是容器（`--profile verify` 的
tmpfs 版），但跑 jest 的是開發者自己的 Node、自己的 pnpm、自己的 `.env`。
於是「本機過、CI 掛」還有一段沒有被消除——而那正是 `verify:ci` 當初想解決的問題。

兩件事都不是修 bug，是**把已經做了一半的東西做完**。

## What Changes

- **新增 nginx 服務作為單一入口**：`/api/*` 轉給 api、其餘轉給 web
  （含 Vite HMR 的 WebSocket upgrade）。api / web 現有的對外埠**保留不動**，
  既有用法不受影響。
- **同時設定 `TRUST_PROXY`**：反向代理之後 `request.ip` 會變成 nginx 容器的 IP，
  不設的話 IP 黑名單、前台登入的失敗計數、全域節流**會把所有請求當成同一個來源**
  ——而且不會有任何錯誤訊息。
- **nginx MUST NOT 自行加安全標頭**：後端 helmet 已負責，CSP 更是剛改成分路徑
  （文件路徑放寬、其餘套預設），nginx 再加一份會把那個判斷整個蓋掉。
- **新增 `--profile e2e`：讓 e2e 的測試行程也跑在容器裡**，複用既有的 tmpfs
  `postgres-verify`，跑完連容器帶資料一起丟。
  **既有的 `pnpm --filter @app/api test:e2e` 不動**——host 跑是最快的迭代路徑。
- **開發容器固定 `LOG_LEVEL: debug`**：容器的 `.env` 是被遮蔽的，
  不寫在 compose 就只會拿到 envSchema 的預設值 `info`。

## Capabilities

### Modified Capabilities

- `platform-container-dev`：
  - **修改**「單一 compose 檔涵蓋三種用途」——變成四種（多了 `--profile e2e`）。
  - **新增**「反向代理必須是單一入口且不重複後端的職責」——涵蓋
    `TRUST_PROXY` 與「不加安全標頭」兩條約束。
  - **新增**「e2e 的測試行程必須可在容器內執行」。

## Impact

**新增檔案**：

| 檔案 | 內容 |
| --- | --- |
| `docker/nginx/default.conf` | server 區塊：`/api` → api、`/` → web、WS upgrade |

**修改**：

| 檔案 | 改動 |
| --- | --- |
| `compose.yml` | 新增 `nginx` 與 `e2e` 兩個服務；api 加 `TRUST_PROXY` 與 `LOG_LEVEL` |
| `package.json` | 新增 `test:e2e:docker` |
| `scripts/` | e2e 容器化的包裝腳本（含 `trap` 收尾） |
| `README.md`、`openspec/project/tooling.md` | 指令表與 compose 用法說明 |

**沒有**：schema 變動、migration、新的應用程式環境變數
（`TRUST_PROXY` / `LOG_LEVEL` 都已在 envSchema 中）。

**不做**：TLS 終結、nginx 直接吐靜態檔、production 映像與部署流程
——見 design 的 Non-Goals。
