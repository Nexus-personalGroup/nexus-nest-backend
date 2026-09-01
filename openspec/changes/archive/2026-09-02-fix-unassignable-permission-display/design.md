## Context

這是對 `improve-permission-tree-legibility`（#32）的修正。那支 change 的判斷
（安全管理維持 `@Roles(SUPERADMIN)`、但必須在權限樹上看得見）沒有問題，
**錯的是呈現方式**：用 checkbox 表達一個不是「勾選狀態」的東西。

錯誤在合併後第一次被人打開超級管理者的檢視 dialog 時就顯形了——
三項未勾選，而那個角色明明做得到。**這不是美觀問題，是畫面在陳述假訊息。**

## Goals / Non-Goals

**Goals:**

- 安全管理區塊在**任何角色**的檢視 / 編輯 dialog 下顯示的內容都是真的。
- 消除「同一個圖示兩種語意」。

**Non-Goals:**

- **不動安全模型**。`SecurityController` 仍是 `@Roles(RoleCode.SUPERADMIN)`。
- **不移除該區塊**——那會把 #32 解掉的問題（權限設定裡找不到 IP 白名單）還原回去。
- 不重新設計權限樹的其餘部分。

## Decisions

### D1：不用 checkbox，而不是「讓 SUPERADMIN 顯示為已勾」

兩條路都能修掉「對超級管理者說謊」，但只有一條能修掉根本問題：

| | 做法 | 結果 |
| --- | --- | --- |
| A | 拿掉 checkbox，改純說明列表 | **選這個** |
| B | `/roles/{id}` 回傳 `roleCode`，SUPERADMIN 時三項顯示已勾 | 語意變準了，但**兩種語意的問題原封不動** |

B 的致命處在於：非 SUPERADMIN 角色的那個未勾方框，意思仍然是
「不由角色決定，永遠給不了」，而它旁邊一模一樣的方框意思是「還沒給，你可以給」。
**產生這次提問的正是那個歧義**，B 修不掉它。

B 另外要動回應契約（swagger yaml + `api-client generate` +
`api-role-management` 的回應規格），成本也比 A 高。

A 之後那一塊**沒有任何狀態需要被表達**：它說的是「這些功能不透過角色權限指派」，
這句話不論你在看哪一個角色都成立。沒有狀態，就沒有東西會錯。

**不選「整塊拿掉」**：#32 要解的問題是真的——使用者看到後台有 IP 白名單頁、
權限設定裡卻找不到它，會判斷成「權限漏設了」。拿掉等於把那個問題還原。

### D2：測試改成斷言「這一區沒有 checkbox」，比原本更強

原本兩支測試斷言「三項皆 disabled」與「點擊後 `permissionCodes` 不變」。
改用「該區塊不含任何 `role="checkbox"`」取代兩者——**它是更強的保證**：
沒有 checkbox 就不可能被點、不可能有值進表單，
連「disabled 但程式仍把值加進去」這個典型壞法都一併排除。

（原本那條「點擊不改變 `permissionCodes`」寫得沒錯，但它防的是
`disabled` 只擋滑鼠不擋程式——拿掉 checkbox 之後那個風險不存在了。）

### D3：保留 tooltip 與 badge，只換掉方框

`限超級管理者` badge、虛線邊框、說明理由的 tooltip 都不動——
它們表達的是「這一區跟上面不同」與「為什麼給不了」，兩者都仍然正確且必要。
只有 checkbox 是錯的，只換它。

## Risks / Trade-offs

- **少了方框，這一區看起來可能不像「權限」。** 用鎖圖示與區塊內的一句說明補上。
  這是可接受的交換：讓它看起來像權限的代價是讓它看起來像「可以勾的權限」。
- **spec 的呈現規則從 MUST checkbox 改成 MUST NOT checkbox**，
  是上週才寫進去的條文。與 `enforce-single-entry-container` 同一類——
  推翻自己寫的需求要留得下紀錄，這份 design 就是那個紀錄。

## Open Questions

無。
