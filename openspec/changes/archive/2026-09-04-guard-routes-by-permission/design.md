## Context

前端已經有三道權限相關的機制，但它們**各自為政**：

| 位置 | 做什麼 | 缺什麼 |
| --- | --- | --- |
| `_nav-items.ts` + `_layout.tsx` | sidebar 依權限隱藏 | 隱藏不是保護，網址照樣打得進去 |
| `RequireAuth` | 擋未登入 | 不看權限 |
| `RequireRole` | 擋非 SUPERADMIN（只用在 security） | 只有 role，沒有 permission；且靜默導頁 |

三者都用**裸字串**的權限碼，沒有任何東西確認那些字串是真的。

## Goals / Non-Goals

**Goals:**

- 手動輸入網址與 sidebar 看到的結果一致。
- 權限碼打錯要在 `pnpm test` 就紅，而不是等有人回報「選單不見了」。
- 「沒有權限」在整個 codebase 只有一種表現。

**Non-Goals:**

- **不動後端。** 真正的授權在 `PermissionsGuard`，它本來就擋得住，
  前端這層是 UX 不是安全（`use-has-permission.ts` 的註解已經寫了這件事）。
- 不改任何權限碼的值、不改 sidebar 的分組。
- 不處理明細路由的權限推導（見 D4）。

## Decisions

### D1：權限碼型別化，但**不跨 workspace 匯入**

`apps/web` 不能 import `apps/api` 的 `Role.ts`——不同 workspace，
而且 api 是 NestJS 的 CommonJS 基線、web 是 Vite ESM。
`packages/api-client` 是從 swagger 產生的，權限碼不在裡面。

所以是**在 web 維護一份常數，用守則保證它與後端目錄一致**。
這是「兩份真相 + 守則」而不是「一份真相」——不理想，但跨 workspace
的型別共享要動建置設定，代價高於這次要解的問題。
**誠實標記**：守則保證的是「碼存在」，不保證兩邊語意相同。

比照 `role-codes.ts` 的既有形狀（`as const` 物件 + 推導型別），
不發明新寫法。`requiredPermission` 的型別從 `string` 收緊為 `PermissionCode`
——這一步才是真正消滅打錯的那個，守則只是第二道。

### D2：`RequirePermission` 比照 `RequireRole`，不做成 HOC 或 route config

既有的 `RequireRole` 是包在 `element` 外面的元件。沿用同一個形狀，
因為它已經在 `App.tsx` 用著，兩種寫法並存會讓人要先判斷該用哪個。

### D3：「沒權限」統一顯示訊息，`RequireRole` 一起改

⚠️ **這是行為變更，而且有代價**：靜默導頁不洩漏「這個頁面存在」，
顯示訊息會。

**仍然選顯示訊息**，因為：

- sidebar 已經藏起來了，會手動輸入該網址的人**已經知道它存在**——
  這個「洩漏」的實際資訊量接近零。
- 靜默導頁的失敗模式是**使用者以為自己點錯了**，然後再試一次、再被彈走。
  沒有任何東西告訴他要去要權限。
- 兩種行為並存比任何一種單獨存在都糟：下一個人要先查才知道該用哪個。

訊息文字採「此帳號無對應權限」——陳述狀態，不指責操作。

### D4：明細路由要顯式宣告，守則只檢查它檢查得到的

`/front-users/:userId`、`/moderation/reports/:reportId` 這類明細路由
**不在 `NAV_ITEMS` 裡**，所以無法從 sidebar 推導它們的權限。

處置：**每條路由自己宣告**，與 sidebar 那份各自維護。
守則因此只能檢查「**路由 path 有出現在 NAV_ITEMS 時，兩邊的權限碼要一致**」
——明細路由漏掛守衛，這條規則抓不到。

**這個限制要寫進需求**，否則下一個人會以為守則涵蓋全部。
（能抓到的部分仍然有價值：列表頁是最常被手動輸入的那些。）

### D5：不把「沒權限」做成 403 頁面路由

導向 `/403` 之類的路徑會讓瀏覽器歷史多一筆，返回鍵會回到那個沒權限的網址、
再被踢一次。就地渲染訊息沒有這個問題。

## Risks / Trade-offs

- **security 頁面的行為變了**（靜默導頁 → 顯示訊息）。影響範圍是非 SUPERADMIN
  手動輸入 `/security/*` 的情況，屬於邊緣路徑，但仍是行為變更。
- **兩份權限碼**（web 常數 vs 後端 `Role.ts`）。守則擋住「碼不存在」，
  擋不住「兩邊對同一個碼的理解不同」。這是 D1 的已知代價。
- **明細路由不在守則涵蓋範圍**（D4），靠人記得掛。

## Open Questions

無。
