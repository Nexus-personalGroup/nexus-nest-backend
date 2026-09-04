## Why

八個列表頁的頁首各自手寫同一段結構，而**「照抄前一頁」會抄歪**。

`add-account-lock-management`（#37）新加的那頁三處都偏了：多了 `p-6`
（全站唯一）、頁首用 `<div>` 而非 `<header>`、標題 `font-bold` 而非 `font-semibold`。
**typecheck / lint / 測試全綠**——是使用者用眼睛看出來的。

而且分歧已經不只一種：`front-users` 沒有動作區，於是它的 `<header>` 沒有
flex classes；其餘七頁有動作區，於是有。**要不要加 flex 目前是各頁自己決定的**，
那是下一個分歧的來源。

⚠️ **這條慣例目前完全沒有寫在任何地方。** `platform-frontend-conventions`
規範了技術棧、目錄結構、路由保護、sidebar、URL state、權限呈現，
就是沒有規範頁首——所以七頁一致是**巧合維持的**。

## What Changes

- 新增 `components/PageHeader.tsx`：標題、選填副標、選填動作區。
  **有無動作區的排版差異收進元件**，呼叫端不再各自決定要不要加 flex。
- **9 處遷移**：八個列表頁 + 營運總覽的兩個狀態（載入中／載入完成）。
- ⚠️ **明細頁刻意不納入**（見 design D2）。
- `platform-frontend-conventions` 新增一條需求，把這個慣例寫下來。

## Capabilities

### Modified Capabilities

- `platform-frontend-conventions`：新增「列表頁的頁首由共用元件提供」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| API 契約 / Swagger | 無 |
| 後端 | 無 |
| 行為變更 | 無。**純結構重構**，畫面輸出與遷移前相同（帳號鎖定頁除外——它本來就是歪的） |

⚠️ **流程上的偏差要記錄**：這支是**先寫程式碼才補提案**的。
起因是一個三行的 className 修正（當時判斷不需要 change 是合理的），
但範圍在對話中長成了「新元件 + 9 處遷移 + 一個排除決策」而我沒有停下來重新評估。
提案因此是**記錄已做的決策**而非事前設計——審閱時請把程式碼與本文一起看。
