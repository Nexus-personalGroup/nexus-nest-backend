## Context

「EDIT 蘊含 VIEW」這條規則在前端有**三個實作**：勾選時的 `toggleEdit`、
顯示鎖定的 `isViewLockedByEdit`、送出前的 `normalizePermissionCodes`。
前兩個都會先問「這個 module 有沒有 VIEW」，第三個不問。

## Goals / Non-Goals

**Goals:**

- 只有 EDIT 的 module 存得起來。
- 需求裡那兩條互相矛盾的 bullet 不再打架。
- 該函式有測試——它現在是零覆蓋。

**Non-Goals:**

- **不動後端。** 後端擋對了，錯的是前端送出的內容。
- 不改「EDIT 蘊含 VIEW」這條規則本身（在兩者都存在時它是對的）。
- 不改附件權限的設計（只有 EDIT 是後端刻意的）。

## Decisions

### D1：讓 normalize 知道哪些碼存在，而不是刪掉它

三個做法：

| 做法 | 評估 |
| --- | --- |
| **傳入可用的權限清單** | ✅ 採用。規則保持一處、仍是 defense in depth，而且判斷依據與 UI 那兩層一致 |
| 直接刪掉補 VIEW 的邏輯，只留 sort/去重 | UI 已經正確地補了，看似可行——但 defense in depth 的用意是擋「表單 state 從別的路徑進來」，刪掉等於放棄那層 |
| 合成之後再過濾掉不存在的碼 | 等價但更繞：先造出錯的再刪掉，比一開始就不造更難讀 |

**呼叫端要多傳一個參數**是這次的成本。`RolesPage` 目前手上沒有權限清單
（它在 `PermissionsField` 那層），要把它拉上來。這個成本是值得的——
**沒有清單就無法正確判斷**，而「不需清單」正是這個 bug 的來源。

### D2：需求的兩條 bullet 要合併敘述，不是刪掉其中一條

矛盾的兩條分別是「統一補入」與「只有一個時不套用」。
**兩條都是對的**，錯在前者沒有帶上後者的前提。

修法是把前提寫進提交那條，而不是刪掉任何一條——
刪「不套用」會讓附件變成必須有 VIEW，刪「統一補入」會讓 defense in depth 消失。

⚠️ **這類矛盾沒有東西看得出來。** `openspec validate` 檢查格式不檢查語意，
而兩條 bullet 分開讀都合理。`tasks/todo.md` 的「已知缺口」已經記過同一形狀
（archive 不會發現 Purpose 與 Requirements 互相矛盾）——**這次是同一類的第二次**，
值得在 todo 補上「requirement 內部的 bullet 也會互相矛盾」。

### D3：測試要涵蓋「不補」那一半

`normalizePermissionCodes` 現在零覆蓋，而它的正向行為（補 VIEW）
就算寫了測試也抓不到這個 bug——**要抓到必須測「只有 EDIT 的 module 不補」**。

這與本專案反覆出現的判準一致：**缺了否定那一半的測試，
「永遠都做」的實作也會綠**。

## Risks / Trade-offs

- **呼叫端多一個參數**，`RolesPage` 要取得權限清單。那是既有的 query，
  多一次訂閱而非多一次請求。
- **清單載入中時 normalize 拿不到資料**。此時應**不補**而非**亂補**——
  送出的內容會是使用者實際勾的，後端仍是最後一道。寫進 tasks。

## Open Questions

無。
