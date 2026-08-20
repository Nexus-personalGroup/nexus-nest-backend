# platform-api-error-response Specification

## Purpose

定義對外錯誤回應的組成規則：錯誤碼與訊息的單一真相、訊息表的完整性保證、動態訊息的參數化方式，
以及 domain 層驗證失敗必須對應到正確的 HTTP status。

錯誤碼有兩個來源且不可混淆——`DomainException` 子類自帶 `ResponseCodes` 常數（業務錯誤），
NestJS `HttpException` 則由 class name 推導（框架層，如 `UNAUTHORIZED`）。

## Requirements

### Requirement: 錯誤訊息單一真相

所有對外錯誤訊息 MUST 定義於單一訊息表 `shared/constants/response-messages.ts`，以 `ResponseCode` 為 key。domain exception 的 constructor MUST NOT 內嵌訊息字面值。

#### Scenario: 新增 domain exception

- **WHEN** 開發者新增一個 domain exception
- **THEN** 其訊息必須先在訊息表中定義，exception 本身只指定 code 與語意 kind

#### Scenario: 審視全部對外文案

- **WHEN** 需要檢查錯誤文案的語氣與用詞是否一致
- **THEN** 只需閱讀訊息表一個檔案，即涵蓋所有對外錯誤訊息

### Requirement: 訊息表完整性由型別保證

訊息表 MUST 以 `Record<ResponseCode, ...>` 型別約束，使每個已註冊的錯誤碼都必須有對應訊息。缺漏 MUST 在 typecheck 階段失敗，而非等到執行期。

#### Scenario: 新增錯誤碼但忘記補訊息

- **WHEN** 開發者在 `ResponseCodes` 新增一個 key 但沒有在訊息表補上對應訊息
- **THEN** `pnpm typecheck` 失敗並指出缺少該 key

### Requirement: 動態訊息參數化

需要執行期資料的訊息（如角色名稱、使用中的帳號數）MUST 在訊息表中定義為函式，由呼叫端傳入參數。型別 MUST 強制此類 code 於建立 exception 時提供算好的訊息，不得依賴基底自動查表。

#### Scenario: 建立需要參數的 exception

- **WHEN** 建立 `DuplicateRoleNameException(name)`
- **THEN** 其訊息由訊息表的函式產生，文案本身仍集中在訊息表中

#### Scenario: 靜態訊息的 exception

- **WHEN** 建立訊息不需參數的 exception
- **THEN** 只需提供 code 與 kind，訊息由基底自訊息表取得

### Requirement: domain 驗證失敗回應正確狀態碼

domain 層的輸入驗證失敗 MUST 拋出 `DomainException` 子類，使回應為對應的 4xx 與業務錯誤碼。MUST NOT 使用原生 `Error`，否則會被歸類為非預期錯誤而回應 500。

#### Scenario: 無效的 member id 格式

- **WHEN** 以不符 UUID 格式的字串呼叫 `MemberId.of()`
- **THEN** 拋出 kind 為 `INVALID` 的 domain exception，HTTP 回應為 400 與對應業務碼，而非 500

#### Scenario: 無效的 email 格式

- **WHEN** 以不符格式的字串呼叫 `Email.of()`
- **THEN** 拋出 kind 為 `INVALID` 的 domain exception，HTTP 回應為 400，且訊息為繁體中文

#### Scenario: 空白的帳號名稱

- **WHEN** 以空字串或全空白建立 / 更新 `Member` 名稱
- **THEN** 拋出 kind 為 `INVALID` 的 domain exception，HTTP 回應為 400

### Requirement: 既有錯誤回應不得改變

除本 change 明確修正的 domain 驗證失敗外，既有 exception 的錯誤碼、HTTP status 與訊息文字 MUST 逐字保持不變。

#### Scenario: 搬移訊息至訊息表後

- **WHEN** 執行既有 e2e 測試套件
- **THEN** 全部通過且錯誤碼斷言結果與搬移前一致
