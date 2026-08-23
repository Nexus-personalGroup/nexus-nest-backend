## ADDED Requirements

### Requirement: 後台簽發的 token 帶側別，且後台端點拒絕其他側

`/api/admin/auth/login` 與 `/api/admin/auth/refresh` 簽出的 token
MUST 在 payload 帶 `side: 'admin'`，且 MUST 以後台的 secret
（`ACCESS_SECRET` / `REFRESH_SECRET`）簽發。

後台的 token 驗證（`ResolveMemberContextService`，HTTP 與 WebSocket 共用）
MUST 拒絕 `side` 不為 `admin` 的 token。

**缺少 `side` 的 token MUST 視為 `admin`**——那是本需求上線前簽出的。
這是**有時效的相容措施**：部署時間超過 refresh token 效期之後，
所有流通中的 token 都會帶 `side`，屆時可改為拒絕。
詳見 `platform-token-scope`。

前台的 token 因為用不同的 secret 簽發，在後台的驗證中**連簽章都過不了**——
`side` 的比對是第二道防線，不是唯一那道。

#### Scenario: 後台登入簽出的 token

- **WHEN** 呼叫 `/api/admin/auth/login` 成功
- **THEN** 兩枚 token 的 payload MUST 含 `side: 'admin'`

#### Scenario: 後台 refresh 換發的 token

- **WHEN** 呼叫 `/api/admin/auth/refresh` 成功
- **THEN** 新簽出的兩枚 token 同樣 MUST 含 `side: 'admin'`

#### Scenario: 以前台 token 呼叫後台端點

- **WHEN** 帶前台簽出的 token 呼叫任何 `/api/admin/*` 的受保護端點
- **THEN** 回 `401`

#### Scenario: 沒有 side 的舊 token

- **WHEN** 帶一枚沒有 `side`、以後台 secret 簽發的有效 token
- **THEN** 視為 `admin` 並放行——既有 session 不因部署而中斷

#### Scenario: WebSocket 連線的側別

- **WHEN** 以非 `admin` 側的 token 建立 WS 連線
- **THEN** 連線 MUST 被拒絕——WS 與 HTTP 走同一份解析邏輯，側別的判定也是同一份
