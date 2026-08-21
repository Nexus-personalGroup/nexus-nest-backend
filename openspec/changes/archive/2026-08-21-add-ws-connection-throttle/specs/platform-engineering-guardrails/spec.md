## MODIFIED Requirements

### Requirement: WebSocket 事件必須表態限流

呼叫 application 層 use case 的 `@SubscribeMessage` handler MUST 表態限流：
接上限流，或明示豁免並註明理由。限流本身 MUST 位於 application 層而非 gateway
——它是業務規則，不是傳輸細節。

**規則以「表態」而非「判斷哪些會寫入」實作。** 用動詞前綴（Send / Create / Update…）
推測寫入型 use case 看似夠用，但 `ToggleReactionUseCase` 這類命名會靜默漏掉——
那正是本專案已發生三次的形狀：規則本身沒錯，只是看不見新東西。
表態式沒有這個失效面：新 handler 只要呼叫 use case 就必須做決定，
決定「不需要」也要寫下理由。

**連線層的事件限流 MUST NOT 被當成豁免的理由。** 兩者的計數單位不同：
連線層是單一連線（開 N 條就有 N 倍額度），業務層是「成員 + 房間」（跨連線、跨實例）。
以「已經有連線層限流」為由豁免寫入型 handler，等於讓多開連線就能繞過。

限流閾值 MUST 來自環境變數，MUST NOT 寫死在程式碼中：實際值要等真實使用資料才調得準，
而為了調一個數字改程式碼、重新部署，最後的結果是沒有人去調。

#### Scenario: handler 呼叫 use case 卻未表態限流

- **WHEN** 某 `@SubscribeMessage` handler 呼叫 use case，既沒接限流也不在豁免清單中
- **THEN** 守則失敗，訊息包含檔案與行號

#### Scenario: 豁免未註明理由

- **WHEN** 某 handler 列入豁免清單卻沒有理由
- **THEN** 守則失敗——豁免一旦失去理由就會逐漸長大

#### Scenario: 以連線層限流為由豁免寫入型 handler

- **WHEN** 某個會寫入的 handler 以「連線層已有限流」為由列入豁免
- **THEN** 違反本需求——開多條連線即可繞過連線層的計數

#### Scenario: 限流寫在 gateway 內

- **WHEN** 限流判斷直接寫在事件 handler 裡
- **THEN** 守則失敗——與「gateway 只做轉譯」同一條界線

#### Scenario: 閾值寫死在程式碼

- **WHEN** 限流的次數或視窗以字面值寫在原始碼中
- **THEN** 守則失敗——閾值必須來自 `validate-env.ts` 的 `envSchema`

#### Scenario: 找不到對應的 service

- **WHEN** use case 對應的 service 檔不存在或命名不符慣例
- **THEN** MUST 視為未表態而非略過——漏報是靜默失效，誤報只是吵
