# platform-token-scope Specification

## Purpose

定義 token 的**作用域**與**存活時間**：一組 token 屬於哪一側（後台 / 前台）、
由什麼決定、以及它能用多久。

作用域由 **secret 決定，side claim 是第二道**——兩側各自簽發，
跨側的 token 在簽章驗證就過不了，而不是靠讀取 payload 裡的欄位來判斷。

效期則與**存放位置綁在一起**：能被 JavaScript 讀到的 token 只能配短效期，
判準是「被偷走之後攻擊者能用多久」。這兩件事分開評估就會出現
「各自可辯護、串起來是放大器」的組合。
## Requirements
### Requirement: Token 的作用域必須由 secret 決定，side claim 是第二道

前台與後台 SHALL 使用**各自的簽發 secret**：
後台用 `ACCESS_SECRET` / `REFRESH_SECRET`，前台用 `FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`。

payload MUST 帶 `side: 'admin' | 'front'`，且驗證時 MUST 比對。

**兩道都要的理由在「忘記檢查時會發生什麼」**：

| | 共用 secret + 只靠 side | 各自的 secret |
| --- | --- | --- |
| 某處忘了比對 side | **跨側存取** | 簽章驗證失敗，天然 fail-closed |
| 新增受保護端點 | 必須記得表態 | 用錯 secret 就是驗不過 |

本專案在黑名單與限流上一貫選 fail-closed，這裡沒有理由選相反的。
「忘記」是一定會發生的事，重點是它發生時的預設結果。

`side` claim 的作用是**可讀性與錯誤訊息**：驗證失敗時能說出「這是另一側的 token」
而不是只有一句「簽章無效」。它是第二道，不是唯一那道。

前台的兩個 secret 在 production MUST 為必填，且 MUST 至少 32 字元——
與後台的兩個同樣的規則。

#### Scenario: 以後台 token 呼叫前台端點

- **WHEN** 帶 `/api/admin/auth/login` 簽出的 token 呼叫 `/api/front/me`
- **THEN** 回 `401`——secret 不同，簽章就驗不過

#### Scenario: 以前台 token 呼叫後台端點

- **WHEN** 帶前台 token 呼叫任何 `/api/admin/*` 的受保護端點
- **THEN** 回 `401`

#### Scenario: 前後台共用同一組 secret

- **WHEN** 實作讓兩側用同一個 secret 簽發，只靠 `side` claim 區分
- **THEN** 違反本需求——那讓「某處忘了比對」的後果從驗證失敗變成跨側存取

#### Scenario: production 未設定前台 secret

- **WHEN** `NODE_ENV=production` 且缺少 `FRONT_ACCESS_SECRET`
- **THEN** 啟動時 MUST 失敗

### Requirement: 缺少 side 的 token 是有時效的相容措施

缺少 `side` 的 token MUST 被當成**有時效的相容措施**處理：後台的驗證 MAY 把
「缺少 `side`」視為 `admin`，使既有 session 不被立即中斷
——本需求上線前簽出的 token 沒有 `side` 欄位。

**這個相容 MUST 被標記為暫時的**：程式碼註解與本 spec 都要寫明它可以在
「部署時間超過 refresh token 效期」之後改成拒絕——屆時所有流通中的 token
都會帶 `side`。沒有這句話，相容措施會變成永久的後門。

前台不需要這個相容：前台的 secret 是新的，用它簽出的 token 從第一天就一定帶 `side`。

#### Scenario: 舊的後台 token

- **WHEN** 帶一枚沒有 `side` 欄位、以後台 secret 簽發的有效 token
- **THEN** 視為 `admin` 並放行

#### Scenario: 相容措施沒有標記時效

- **WHEN** 程式碼中的相容處理沒有註明何時可以移除
- **THEN** 違反本需求的意圖——沒有期限的相容措施不會被移除

### Requirement: 受保護端點的側別必須由所屬側決定，不得逐支表態

端點屬於哪一側 SHALL 由它掛在哪個模組樹下決定（`admin/` 或 `front/`），
MUST NOT 靠每支端點各自宣告。

逐支表態的規則會在新增端點時被忘記，而忘記的後果是一個**看起來正常但跨側可達**
的端點——它不會有任何錯誤訊息。這與「WS 事件必須表態限流」那條規則的
形狀相同，但這裡有更好的辦法：側別是位置的函式，而位置是強制的
（`side-isolation.spec.ts` 已經在守著原始碼相依）。

#### Scenario: 新增一支前台端點

- **WHEN** 在 `src/modules/front/` 下新增受保護的 controller
- **THEN** 它 MUST 自動只接受前台 token，不需要任何額外宣告

#### Scenario: 端點自行宣告側別

- **WHEN** 某支端點用裝飾器或參數宣告自己屬於哪一側
- **THEN** 違反本需求——那是會被忘記的表態

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

