## MODIFIED Requirements

### Requirement: master spec 的命名與格式檢查

系統 SHALL 確保 `openspec/specs/` 的能力名稱帶 `api-` / `ui-` / `platform-` / `ws-` 前綴、
spec.md 的標題行與目錄名一致、`api-*` 中宣告 endpoint 的需求皆寫出 Request 與
Success / Failure Response、`ws-*` 中宣告事件的需求皆寫出該方向所需的區塊、
且 `ui-*` / `platform-*` / `ws-*` MUST NOT 寫 HTTP 的 API 回應區塊。

格式規範由 `openspec instructions` 在產生 artifact 時餵給 AI，但**產生之後就沒有東西
再檢查**——spec 被手改或 AI 沒照做都不會有徵兆。

WebSocket 事件契約的形狀與 HTTP endpoint **不對稱**，因此不能共用同一組必填區塊：
客戶端送入的事件有 payload 與可選的 ack，伺服器推送的事件則沒有對應的請求可回應。
以需求內文第一行的方向標記判定：

| 第一行 | 必填區塊 |
| --- | --- |
| `` `client:<event>` `` | **Payload**、**Ack**、**Failure Responses** |
| `` `server:<event>` `` | **Payload** |

`client:` 的事件即使沒有 ack 也 MUST 明示「本事件無 ack」，MUST NOT 省略——
省略與「忘了寫」在文件上長得一模一樣。

#### Scenario: 能力名稱缺少分類前綴

- **WHEN** `openspec/specs/` 出現不帶前綴的目錄
- **THEN** 檢查失敗並說明四類前綴各自的寫法

#### Scenario: api 端點需求缺少回應形狀

- **WHEN** `api-*` 中某需求以 `` `METHOD /path` `` 開頭但無 Success Response
- **THEN** 檢查失敗並指出該需求名稱

#### Scenario: WebSocket 事件需求缺少必填區塊

- **WHEN** `ws-*` 中某需求以 `` `client:<event>` `` 開頭但沒有寫 Ack
- **THEN** 檢查失敗並指出該需求名稱與缺少的區塊

#### Scenario: WebSocket 契約誤用 HTTP 的區塊

- **WHEN** `ws-*` 的 spec 出現 `**Success Response**`
- **THEN** 檢查失敗——WS 事件的回應形狀是 Ack，混用會讓「非 api- 不得寫 API 回應區塊」失去意義

#### Scenario: 尚無任何 ws-* 能力

- **WHEN** 專案還沒有以 `ws-` 開頭的能力
- **THEN** 事件契約的檢查正常通過而非失敗——但其判定邏輯 MUST 有合成輸入的自我測試，
  否則規則在真正被使用之前都無從得知是否正確
