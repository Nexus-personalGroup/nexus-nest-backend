## ADDED Requirements

### Requirement: 連線撤銷通知

`server:sessionRevoked` SHALL 於某成員的帳號被停用時，送達該成員的所有連線，
且 MUST 跨實例送達。送出後 MUST 主動斷開這些連線。

**先送事件再斷線**，順序不可顛倒：斷線後就沒有管道可以說明原因了。

事件 MUST 帶足夠的資訊讓客戶端停止自動重連。Socket.IO 的客戶端預設會重連，
只斷線而不說原因會讓被停權者進入無盡的重連迴圈——每次都在 handshake 被拒，
而使用者看到的是「一直在連線中」而不是「你的帳號已停用」。

MUST NOT 依賴 Socket.IO 的 disconnect reason 傳遞這個資訊：
那是傳輸層的字串，客戶端拿到的可能是 `io server disconnect`，
不足以區分「被停權」與「伺服器重啟」。

**Payload**：

```json
{
  "reason": "ACCOUNT_DISABLED",
  "revokedAt": "2026-08-21T06:00:00.000Z"
}
```

#### Scenario: 成員被停權

- **WHEN** 某成員的帳號被停用
- **THEN** 該成員的所有連線收到 `server:sessionRevoked` 並隨即被斷開

#### Scenario: 連線在其他實例

- **WHEN** 被停權者的連線落在另一個 API 實例
- **THEN** 該連線同樣收得到並被斷開——推播經跨實例廣播

#### Scenario: 其他成員不受影響

- **WHEN** 某成員被停權
- **THEN** 同房間其他成員的連線 MUST NOT 被斷開

#### Scenario: 沒有連線時

- **WHEN** 被停權者當下沒有任何 WebSocket 連線
- **THEN** 不視為錯誤，停權照常完成
