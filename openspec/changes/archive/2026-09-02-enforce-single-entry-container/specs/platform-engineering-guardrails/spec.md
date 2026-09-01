## ADDED Requirements

### Requirement: 容器模式單一入口的守則

系統 SHALL 確保 `compose.yml` 的 api 與 web 服務不宣告 `ports:`——
容器模式的唯一入口是反向代理。

檢查 MUST 以**服務名稱**表述（「api 與 web 不得有 `ports:`」），
MUST NOT 寫成「只有 nginx / postgres / redis 可以有 `ports:`」的白名單：
白名單會在有人加新服務時誤報，而誤報的處理方式是把服務加進白名單，
規則從此空轉。

這條守則防的不是「有人不同意單一入口」，是**「為了 debug 暫時開一下然後忘了拿掉」**
——那個回歸沒有任何症狀，只會讓下一次驗 CORS 或 cookie 的人得到錯的結論。

#### Scenario: api 被加回對外埠

- **WHEN** `compose.yml` 的 api 服務出現 `ports:` 宣告
- **THEN** 檢查失敗，訊息指出容器模式的入口只有代理，
  並說明要直連請改用 host 模式

#### Scenario: 掃描範圍失效

- **WHEN** 服務名稱或 compose 結構改變，導致檢查掃不到 api / web 服務
- **THEN** 檢查 MUST 失敗而非默默通過——掃不到東西的規則等於不存在
