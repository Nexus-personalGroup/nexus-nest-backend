## Why

`improve-permission-tree-legibility`（#32）把安全管理畫進權限樹，用的是
**disabled 且恆為未勾的 checkbox**。那個選擇有兩個問題，第二個才是根本的。

**① 它對超級管理者說謊。** checkbox 寫死 `checked={false}`，於是打開
**超級管理者**的唯讀檢視時，安全管理三項顯示為未勾選——而
`SecurityController` 正是 `@Roles(RoleCode.SUPERADMIN)` 擋的，
**這個角色恰恰做得到那三件事**。畫面等於在說「超級管理者沒有 IP 管理權限」。

**② 同一個圖示在同一張表上有兩種意思。** 一般項目的未勾是「還沒給，你可以給」，
安全管理的未勾是「不由角色決定，永遠給不了」。用同一個方框表達兩件事，
使用者只能猜——而實際發生的第一個反應就是「這邊怎麼沒有勾選」。

修①（讓 SUPERADMIN 顯示為已勾）需要在 `/roles/{id}` 回傳 `roleCode`
（目前只回 `name / status / isDefault / permissionCodes`），而且**修不掉②**。
所以改成不用 checkbox。

## What Changes

- **安全管理區塊改為純說明列表**：拿掉三個 checkbox，改成帶鎖圖示的文字項目，
  並在區塊內寫明「這些功能不透過角色權限指派，限超級管理者」。
  不論檢視哪一個角色，這句話都是真的——沒有任何狀態需要被表達，也就沒有東西會錯。
- **保留其餘設計**：虛線邊框、「限超級管理者」badge、說明理由的 tooltip，
  以及它在權限樹最後的位置。#32 要解的問題（「後台有 IP 白名單頁、
  權限設定裡卻找不到」）仍然被解決。
- **測試同步**：原本斷言「三個 disabled checkbox」與「點擊不改變 permissionCodes」
  的兩支測試，改為斷言「該區塊不含任何 checkbox」——**那是更強的保證**，
  沒有 checkbox 就不可能有值進表單。

**不做**：不在 `/roles/{id}` 加 `roleCode`（見 design D1）；
不移除整個區塊（那會把 #32 解掉的問題還原回去）；不動任何守衛或權限碼。

## Capabilities

### Modified Capabilities

- `ui-role-management`：修改「不可指派的權限必須可見」——
  呈現方式從「checkbox disabled」改為「不使用 checkbox」，
  並補上「不得暗示任何授予狀態」這條約束。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 / 權限碼 / 守衛 | 無 |
| API 契約 / Swagger | 無 |
| 部署相依 | **無**——本次不動 `PERMISSION_CATALOG`，不需要重跑 seed |
| 前端 | `PermissionsField` 的不可指派區塊與其兩支測試 |
