## ADDED Requirements

### Requirement: refresh token 的效期必須與其儲存方式相稱

`REFRESH_TOKEN_EXPIRES_IN` 的預設值 SHALL 為 86400（1 天）。

**判準是「這個 token 被偷走之後，攻擊者能用多久」**，而那取決於它存在哪裡。
後台 SPA 目前把 refresh token 存在 `localStorage`——任一處 XSS 都讀得到。
配上 7 天效期與 refresh 輪替續命，被偷走一次等於**可自我續期的完整帳號接管**，
而 `tokenVersion` 不會因此遞增（它只在偵測到 refresh 重用時才動），
受害者不會有任何察覺的機會。

因此**效期與儲存方式是一組綁在一起的決定**，MUST NOT 分開評估：
存在 `localStorage` 就 MUST 配短效期；要放長效期就 MUST 先改成
`httpOnly` cookie。兩者都不做而只放長效期 MUST 視為違反本需求。

後台管理系統每天重新登入一次 SHALL 視為可接受的成本。

#### Scenario: 未顯式設定時的預設

- **WHEN** `.env` 沒有設 `REFRESH_TOKEN_EXPIRES_IN`
- **THEN** 有效值 MUST 為 86400 秒

#### Scenario: refresh token 存在 localStorage 且配長效期

- **WHEN** 前端把 refresh token 存在 `localStorage`，而效期設為 7 天
- **THEN** 違反本需求——兩者必須一起改，或改儲存、或縮效期

#### Scenario: 效期屆滿

- **WHEN** refresh token 已超過效期
- **THEN** 換發 MUST 失敗，使用者 MUST 重新登入

#### Scenario: 儲存方式改為 httpOnly cookie 之後

- **WHEN** refresh token 不再由 JavaScript 可讀的位置持有
- **THEN** 效期 MAY 重新評估——本需求約束的是兩者的**組合**，不是單一數字
