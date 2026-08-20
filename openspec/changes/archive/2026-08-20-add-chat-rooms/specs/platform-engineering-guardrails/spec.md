## ADDED Requirements

### Requirement: WebSocket 事件的資源存取必須經授權判斷

接受資源識別碼的 `@SubscribeMessage` handler SHALL 透過 application 層取得授權判斷，
MUST NOT 僅憑客戶端提供的識別碼（`roomId`、`messageId` 這類）直接操作。
確實不需要授權的事件 MUST 明示豁免並註明理由。

這是 HTTP 端「接受任意資源識別碼的端點必須表態授權」的 WebSocket 版本。
M1 的 `joinGroup` 直接把連線加入客戶端指定的任意 group，**通過了當時所有守則**
——`authorization-coverage` 檢查的是「handler 有沒有表態認證」，而它表態了。
本專案已因缺少這類「檢查應存在而不存在」的規則發生過附件 IDOR。

判定 MUST 去除註解後再比對：說明某個檢查的文字最常出現在「有做那個檢查」的檔案裡，
用字串比對會讓偽陰性集中在本來就正確的地方，等到有人重構移除時才顯形。

#### Scenario: handler 直接使用客戶端提供的識別碼

- **WHEN** 事件 handler 的 payload 含資源識別碼，卻未呼叫 application 層即操作 socket
- **THEN** 守則失敗，訊息包含檔案與行號

#### Scenario: 明示豁免但未註明理由

- **WHEN** 某 handler 列入豁免清單卻沒有理由
- **THEN** 守則失敗——豁免一旦失去理由就會逐漸長大

#### Scenario: 註解提及授權即被視為已授權

- **WHEN** handler 只有註解提到授權判斷，實際沒有呼叫
- **THEN** 守則仍須失敗——比對前須去除註解
