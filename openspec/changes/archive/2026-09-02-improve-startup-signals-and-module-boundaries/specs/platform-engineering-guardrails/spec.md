## ADDED Requirements

### Requirement: 布林環境變數必須以列舉宣告

`envSchema` 中代表布林的環境變數 MUST 以 `z.enum(['true','false'])` 宣告，
MUST NOT 用 `z.string()` 搭配 `.transform((v) => v === 'true')`。

寬鬆寫法把**任何非 `'true'` 的值都當成 false**：`SMTP_SECURE=TRUE`（大寫）、
`=1`、`=yes` 全都靜默失效。對預設關閉的開關只是沒生效，
對預設開啟的安全性開關（如稽核）則是**靜默關掉了它**。

MUST NOT 改用 `z.coerce.boolean()`：它走 JS 的 truthy 規則，
而 `'false'` 是非空字串——`FOO=false` 會變成 `true`，比現況更糟。

檢查 MUST 判別 `.transform((v) => v === 'true')` 前面接的是 `.string()`
還是 `.enum()`。接在 `z.enum` 後面是**正確**寫法（列舉負責驗證、
transform 負責轉成 boolean），不得誤報。

#### Scenario: 新增一個用寬鬆寫法的布林變數

- **WHEN** `envSchema` 出現 `z.string().default('false').transform((v) => v === 'true')`
- **THEN** 檢查失敗，訊息說明該寫法會讓 `TRUE` / `1` 靜默變成 false

#### Scenario: 正確寫法不得被誤報

- **WHEN** 變數宣告為 `z.enum(['true','false']).default('true').transform((v) => v === 'true')`
- **THEN** 檢查通過

#### Scenario: 掃描範圍失效

- **WHEN** 讀不到 `validate-env.ts` 或其中一個布林宣告都掃不到
- **THEN** 檢查 MUST 失敗而非默默通過

### Requirement: admin 模組不得相依 WebSocket 連線層

`src/modules/admin/` 底下的模組 MUST NOT import `ChatWsModule`。
需要撤銷成員連線的走 `SessionRevocationModule`，
需要推播事件的走 `EventPublisherModule`。

`ChatWsModule` 裝的是**連線層**：gateway、連線限流、Socket.IO adapter。
admin 側需要的只是「送一個事件」或「把某人踢下線」兩個能力，
為此把整層連線基礎設施拉進 DI 圖是接線的意外而非設計。

**這條擋的是回歸不是無知**：下一個要在 admin 側推播的人，最短路徑就是
`import { ChatWsModule }`，而它會通過 typecheck、通過所有測試、功能也正常。
沒有守則的話這個邊界會在幾個月內被磨平。

檢查 MUST 同時確認掃到了 admin 模組檔案——掃不到就失敗。

#### Scenario: admin 模組為了推播而 import 連線層

- **WHEN** `src/modules/admin/` 下任一模組 import `ChatWsModule`
- **THEN** 檢查失敗，訊息指出應改用 `EventPublisherModule` 或 `SessionRevocationModule`

#### Scenario: 連線層自己仍可持有 gateway

- **WHEN** `ChatWsModule` import `EventPublisherModule`
- **THEN** 通過——本需求限制的是方向，不是禁止該模組存在
