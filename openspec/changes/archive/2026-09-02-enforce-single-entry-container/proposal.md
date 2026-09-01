## Why

上一個 change 做了 nginx 單一入口，但**沒有把另外兩扇門關上**：容器模式下
`127.0.0.1:3000`（api）與 `127.0.0.1:5173`（web）仍然直接對外。當時寫進
`platform-container-dev` 的理由是「反向代理是多一條路，不是取代」——那是保守，
因為代理剛做好、還沒被日常使用驗證過。

一週下來代理是穩的。而留著那兩扇門的成本現在看得清楚了：**它讓「單一 origin」
變成可選的。** 走 `:5173` 進來的人，CORS、cookie 的 `SameSite`、CSP 的分路徑判斷
走的都不是上線時那條路——那恰好是當初做代理要消除的東西。一個隨時能被繞過的
拓撲等於沒有拓撲，而繞過去不會有任何錯誤訊息，只會在上線那天才發現不一樣。

**這個 change 推翻上一個 change 剛寫進 spec 的一條需求**，所以要留成獨立紀錄：
下一個人讀到「MUST 保留」與現況不符時，要找得到中間發生了什麼。

## What Changes

- **`compose.yml` 的 api 與 web 移除 `ports:`**——容器模式下 nginx（`8080`）
  是唯一入口。api 提供的東西全部在 `/api` 與 `/socket.io` 之下，兩者都已經
  在代理的路由表裡，**沒有任何功能因此失去入口**（Swagger 走
  `http://127.0.0.1:8080/api/admin/docs`）。
- **`CORS_ORIGIN` 改指向代理的 origin**。原本指著即將關閉的 `:5173`——
  指著連不上的位址不會報錯，只會在真的有跨 origin 請求時才炸。
- **刪掉 `APP_API_PORT` / `APP_WEB_PORT` 兩個變數**：移除 `ports:` 之後
  它們沒有任何使用者。留著沒有使用者的變數，就是下一個「照文件設了但沒作用」。
- **新增守則擋回頭**：`compose.yml` 的 api / web 不得出現 `ports:`。
  這是「推翻自己上週寫的需求」，最可能的回歸是有人為了 debug 方便把埠加回去
  然後忘記拿掉——那正是守則存在的理由。
- **文件同步**：README 的「三個入口」表、`tooling.md` 的埠說明、
  `docker/nginx/default.conf` 檔頭那句「原本的對外埠仍然可用」。

**不做**：不開 `compose.debug-ports.yml` 之類的除錯逃生門（見 design D2）；
不動 host 模式——`pnpm docker:deps` + `pnpm dev` 仍然是 3000 / 5173，
那條路本來就在，且它是**唯一還會走到 CORS 的跑法**（見 design D3）。

## Capabilities

### Modified Capabilities

- `platform-container-dev`：修改「反向代理必須是單一入口，且不得重複後端已負責的職責」
  ——把「api 與 web 各自的對外埠 MUST 保留」反轉為「MUST NOT 宣告 `ports:`」，
  並補上 `CORS_ORIGIN` 必須指向代理的約束。

### Added Capabilities

- `platform-engineering-guardrails`：新增「容器模式單一入口的守則」——
  `compose.yml` 的 api / web 出現 `ports:` 時檢查失敗。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數（`envSchema`） | 無新增。`CORS_ORIGIN` 只改 compose 給的值 |
| API 契約 / Swagger | 無 |
| 前端程式碼 | 無 |
| 開發者操作 | **容器模式的網址從 `:5173` / `:3000` 改成 `:8080`**——書籤要換 |
| CI | 無。`verify:ci` 與 `test:e2e:docker` 都不經過 api / web 的對外埠 |
