## MODIFIED Requirements

### Requirement: 連線必須先通過認證，且與 HTTP 走同一份解析邏輯

WebSocket 連線 SHALL 於 handshake 階段取得並驗證 access token，未通過者 MUST NOT 收送任何事件。

**連線的身分是前台使用者（`users`），不是後台管理員（`members`）。**
聊天是前台的功能，而後台帳號沒有理由出現在聊天室裡。
以後台 token 建立連線 MUST 被拒絕——不是因為權限不足，而是簽章驗不過
（兩側各自的 secret，見 `platform-token-scope`）。

**信箱尚未驗證的帳號 MUST NOT 建立連線。** 聊天是「已驗證」這道門檻擋下的功能，
而 HTTP 那一側由 `EmailVerifiedGuard` 負責——WS 沒有 Guard 可掛，
因此這道檢查寫在 `handleConnection` 裡，走與其他拒絕原因**相同的斷線路徑**。
只擋 HTTP 不擋 WS 的話，未驗證的帳號雖然開不了房間，卻能連上去收別人的廣播。

token 的解析與判定 MUST 呼叫與**前台 HTTP** 認證相同的 application service
（`ResolveUserContextUseCase`），MUST NOT 在 WS 層重寫一份。
兩條路徑允許不同的**取 token 方式**與**失敗表現形式**，但「這個 token 是否有效、
對應哪個使用者」的判定 MUST 只有一個實作。**驗證狀態同理**：
它來自 `UserContext.emailVerified`，MUST NOT 在 WS 層自己再查一次資料庫。

重寫一份的代價已有前例：舊專案的 WS 認證漏掉 `tokenVersion` 比對，導致帳號被強制登出後
既有的 WS 連線仍然有效，且沒有任何徵兆。

token MUST 由 handshake 的 `auth` 欄位或 `Authorization` header 取得，
MUST NOT 接受 query string——query 會出現在伺服器日誌與 Referer header 中。

#### Scenario: 未提供 token

- **WHEN** 連線的 handshake 不含 token
- **THEN** 伺服器送出認證失敗事件後主動斷線，該連線 MUST NOT 進入任何群組

#### Scenario: 以後台 token 連線

- **WHEN** 客戶端以 `/api/admin/auth/login` 簽出的 token 建立 WS 連線
- **THEN** 連線 MUST 被拒絕——聊天是前台的功能

#### Scenario: 信箱尚未驗證

- **WHEN** 未驗證信箱的帳號以有效的前台 token 建立 WS 連線
- **THEN** 連線 MUST 被拒絕並斷開，該連線 MUST NOT 進入任何群組，
  也 MUST NOT 產生任何 presence 紀錄

#### Scenario: 驗證後即可連線

- **WHEN** 該帳號完成信箱驗證後，以**同一個** token 重新連線
- **THEN** 連線成功——驗證狀態在每次 handshake 重新解析，不快取在 token 裡

#### Scenario: token 已被撤銷

- **WHEN** 使用者的 `tokenVersion` 已因改密碼或強制登出而遞增，客戶端仍持舊 token 連線
- **THEN** 連線被拒絕——與同一個 token 打前台 HTTP API 的結果一致

#### Scenario: 以 query string 夾帶 token

- **WHEN** 客戶端把 token 放在連線 URL 的 query
- **THEN** 伺服器 MUST NOT 採信，視同未提供
