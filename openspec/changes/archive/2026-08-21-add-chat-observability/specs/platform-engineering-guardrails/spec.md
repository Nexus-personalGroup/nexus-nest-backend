## ADDED Requirements

### Requirement: 稽核 port 的呼叫必須接住錯誤

呼叫稽核 port 的位置 MUST 接住錯誤（`catch`），MUST NOT 讓它的失敗往上拋。

沒有這條規則的話，日後有人寫成 `await this.audit.record(...)` 而不接錯誤，
稽核表一出問題整個聊天就掛掉——而測試不會有任何徵兆，因為測試裡的稽核不會失敗。

判定 MUST 去除註解後再比對。

#### Scenario: 未接錯誤的稽核呼叫

- **WHEN** 某處呼叫稽核 port 卻沒有 `catch`
- **THEN** 守則失敗，訊息包含檔案與行號

#### Scenario: 只有註解提到錯誤處理

- **WHEN** 呼叫處只有註解說明「失敗不影響業務」，實際沒有 catch
- **THEN** 守則仍須失敗

### Requirement: application 層不得相依監控套件

`src/application` 與 `src/domain` 之下 MUST NOT import `prom-client`
或其 NestJS 包裝，MUST 透過 `MetricsPort`。

換掉監控實作時不該動到任何業務程式碼；而一旦業務層直接使用了 counter，
那個相依會安靜地擴散到每一支 service。

#### Scenario: application 層 import prom-client

- **WHEN** `src/application` 下的檔案 import `prom-client`
- **THEN** 守則失敗

#### Scenario: adapter 層 import prom-client

- **WHEN** `src/adapter/out` 下的實作 import `prom-client`
- **THEN** 守則通過——那正是它該待的地方
