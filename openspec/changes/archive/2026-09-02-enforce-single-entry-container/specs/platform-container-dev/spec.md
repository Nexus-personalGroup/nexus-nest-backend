## MODIFIED Requirements

### Requirement: 反向代理必須是單一入口，且不得重複後端已負責的職責

系統 SHALL 提供一個 nginx 服務作為開發環境的單一入口：
`/api/*` 轉給 api，其餘轉給 web，並 MUST 支援 WebSocket upgrade
（Vite 的 HMR 與聊天的 Socket.IO 都走 WS）。

**「單一」是字面意思**：`compose.yml` 的 api 與 web 服務 MUST NOT 宣告 `ports:`。
容器模式下代理是唯一的進入方式。

留一條直連的備援看似無害，實際上它讓「單一 origin」變成可選的——走直連進來時，
CORS、cookie 的 `SameSite`、CSP 的分路徑判斷都不是上線時那條路。更糟的是
**代理設定漂掉時沒有人會發現**，因為日常還有另一條路能用。

要直連 api 或 web 的人走 **host 模式**（`pnpm docker:deps` + `pnpm dev`）——
那條路本來就是 3000 / 5173，不需要在容器模式再開一次。
要分辨「代理壞了還是應用壞了」則從代理容器內部打後端
（`docker compose exec nginx wget -qO- http://api:3000/api/health`），
那比開一個 host 埠更精準：它涵蓋了代理的網路路徑。

**容器模式下的 `CORS_ORIGIN` MUST 指向代理的 origin**，MUST NOT 指向已關閉的
web 埠。指著連不上的位址不會報錯，只會在真的有跨 origin 請求時才炸。

**代理 MUST 轉發來源 IP**（`X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto`），
且應用程式 MUST 設定為採信它（`TRUST_PROXY`）。

不設的後果是**靜默的**：`request.ip` 會變成 nginx 容器的 IP，於是
IP 黑名單擋不到真正的來源、登入失敗計數把所有人算成同一個、
全域節流變成全站共用一份額度。**沒有任何一個會報錯**——
它們都會照常運作，只是判斷的對象全錯。

**代理 MUST NOT 自行加上任何安全標頭**（CSP、X-Frame-Options、
X-Content-Type-Options 等），那些由後端的 helmet 統一負責。
CSP 尤其不可加：後端的 CSP 是**分路徑**的（API 文件路徑放寬、其餘套預設），
在代理層加一份等於把那個判斷整個蓋掉，而且蓋掉之後兩邊都不會失敗。

#### Scenario: 一般 API 請求

- **WHEN** 對代理的 `/api/health` 發出請求
- **THEN** 由 api 服務回應，且回應 MUST 帶後端產生的安全標頭

#### Scenario: 前端頁面請求

- **WHEN** 對代理的 `/` 發出請求
- **THEN** 由 web 服務回應

#### Scenario: WebSocket 連線

- **WHEN** 透過代理建立 WebSocket 連線
- **THEN** 連線 MUST 成功建立——缺少 upgrade 設定時前端的 HMR 與聊天都會斷

#### Scenario: ⭐ 來源 IP 的辨識

- **WHEN** 兩個不同來源的請求經由代理抵達
- **THEN** 應用程式 MUST 分辨得出它們來自不同的 IP，
  MUST NOT 都看成代理自身的位址

#### Scenario: ⭐ 代理層自行加了 CSP

- **WHEN** 代理設定中出現 `add_header Content-Security-Policy`
- **THEN** 違反本需求——後端的分路徑判斷會被覆蓋

#### Scenario: 既有的直連方式

- **WHEN** 整套跑在容器裡，連 api 或 web 原本的對外埠
- **THEN** MUST 連不上——那兩個埠不再發布。
  （這條的結論與上一版相反：當時是「MUST 仍然可用」。
  同一個場景保留同一個名字，是為了讓反轉在 diff 裡看得見。）
  要直連請改用 host 模式

#### Scenario: ⭐ 有人把 `ports:` 加回 api 或 web

- **WHEN** `compose.yml` 的 api 或 web 服務出現 `ports:` 宣告
- **THEN** 違反本需求，且 MUST 有自動化檢查會失敗——
  「為了 debug 暫時開一下然後忘了拿掉」是這條規則最可能的破口

#### Scenario: Swagger 與健康檢查的入口

- **WHEN** 容器模式下要開 Swagger 或打健康檢查
- **THEN** MUST 經由代理可達（`/api/*` 之下），
  MUST NOT 因為關閉 api 的對外埠而失去入口
