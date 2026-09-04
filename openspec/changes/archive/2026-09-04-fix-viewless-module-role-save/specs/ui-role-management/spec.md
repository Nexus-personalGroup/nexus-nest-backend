## MODIFIED Requirements

### Requirement: 權限蘊含關係 — EDIT 隱含 VIEW

在同一個 module group 內，若同時提供 `VIEW` 與 `EDIT` 兩個 permission，使用者操作 UI 與最終提交內容 SHALL 滿足「EDIT 蘊含 VIEW」的限制。

- 勾選某 module 的 `EDIT` checkbox MUST 自動將同 module 的 `VIEW` 加入表單 `permissionCodes`。
- 當某 module 的 `EDIT` 已勾選時，同 module 的 `VIEW` checkbox MUST 顯示為勾選且 `disabled`，使用者 MUST NOT 能透過點擊將它取消；hover tooltip MUST 顯示「啟用編輯時需具備檢視權限」。
- 取消某 module 的 `EDIT` MUST NOT 自動取消同 module 的 `VIEW`（保留「只給檢視」的設定彈性）；EDIT 取消後 VIEW checkbox MUST 重新可點擊。
- 提交給後端的 `permissionCodes` MUST 滿足「凡含 `X:Y:EDIT` **且該 module 也提供 `X:Y:VIEW`** 時即必含 `X:Y:VIEW`」；submit handler MUST 在組 POST/PATCH body 之前透過 `normalizePermissionCodes` helper 統一補入缺失的 VIEW 並 sort/去重，作為 defense in depth。
- 若某 module 後端僅提供 VIEW 或僅提供 EDIT 其中一個，視為獨立 checkbox，本規則不套用。

⚠️ **補 VIEW MUST 依據後端實際提供的權限清單判斷，MUST NOT 以字串推導。**
「凡 `X:Y:EDIT` 就補 `X:Y:VIEW`」看起來等價，實際上會**合成不存在的權限碼**：
附件只有 `BACKEND:ATTACHMENT:EDIT`（後端刻意的——附件沒有「只能看」的場景），
而合成出的 `BACKEND:ATTACHMENT:VIEW` 會讓整個角色存不起來。

**上一條與提交那條曾經互相矛盾**：提交那條寫「統一補入缺失的 VIEW」而沒有帶上
「兩者都提供」的前提，於是 module 只有 EDIT 時兩條打架，實作照著前者做了。
**兩條都是對的，錯在前提沒有寫進去**——這類矛盾分開讀都合理，
沒有任何檢查看得出來。

清單尚未載入時 MUST **不補**而非臆測：送出的內容維持使用者實際勾選的，
後端仍是最後一道防線。

#### Scenario: 勾 EDIT 自動勾 VIEW

- **WHEN** 使用者點選某 module（如 ROLE）的 `EDIT` checkbox（原本兩者皆未勾）
- **THEN** 該 module 的 `VIEW` 同時被自動勾選；`VIEW` checkbox 變成 `disabled` 並維持勾選狀態，hover tooltip 顯示「啟用編輯時需具備檢視權限」

#### Scenario: VIEW 在 EDIT 勾選時無法被取消

- **WHEN** 某 module 的 `EDIT` 已勾選，使用者嘗試點擊同 module 的 `VIEW` checkbox
- **THEN** 該 checkbox 維持勾選狀態，不會被取消（disabled 阻止互動）

#### Scenario: 取消 EDIT 不自動取消 VIEW

- **WHEN** 某 module 的 `EDIT` 與 `VIEW` 都勾選的狀態下，使用者取消 `EDIT`
- **THEN** `EDIT` 被取消，`VIEW` 仍維持勾選且 checkbox 重新可點擊（disabled 解除）

#### Scenario: 提交時自動補 VIEW

- **WHEN** 表單 state 不知何故含某 module 的 EDIT code 但未含對應 VIEW code（例如從 URL 直接帶入或 race condition）
- **THEN** 送往後端的 `permissionCodes` 自動補入該 VIEW code，最後依字母排序、去重

#### Scenario: ⭐ module 只提供 EDIT

- **WHEN** 使用者勾選只有 EDIT 的 module（如附件）並送出
- **THEN** MUST NOT 補入該 module 的 VIEW——那個碼不存在，
  補了會讓整個角色存不起來

#### Scenario: 權限清單尚未載入

- **WHEN** submit 時尚未取得後端的權限清單
- **THEN** MUST NOT 臆測補入任何 VIEW；送出使用者實際勾選的內容
