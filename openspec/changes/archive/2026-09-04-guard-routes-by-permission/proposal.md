## Why

**① 手動輸入網址就繞過 sidebar 的隱藏。**

Sidebar 依 `requiredPermission` + `requiredRoleCode` 過濾得很完整，
但 `App.tsx` 的路由**只有 `RequireAuth`**（登入與否）與少數 `RequireRole`
（security 的 SUPERADMIN gate）。沒有 `BACKEND:ROLE:VIEW` 的人看不到「角色管理」，
**但手動輸入 `/roles` 頁面照樣渲染**，然後它打的每一支 API 被後端擋成 403。

**不是安全漏洞**——真正的門在後端 `PermissionsGuard`，而且有守則看著，資料不會外洩。
**是體驗問題**：使用者看到的是空殼頁面配一串錯誤，而不是一句說得出原因的話。

**② 權限碼是裸字串，打錯完全沒有徵兆。**

```ts
requiredPermission: 'BACKEND:ACCOUNT:VIEW',   // 打成 VEIW 不會有任何東西紅
```

`role-codes.ts` 已經把 role 型別化了，**權限碼沒有**。
打錯的後果是那個 sidebar 項目對**所有人**消失——包含 SUPERADMIN——
而 typecheck / lint / 測試全綠。這正是本專案反覆踩的「靜默的半成品」，
而 `#32 → #34` 就是同一族（權限顯示的靜默錯誤）。

後端的權限目錄是 `shared/constants/permissions.ts` 的 `PERMISSION_CATALOG`，**是可比對的**——缺的只是去比。

## What Changes

- **權限碼型別化**：`apps/web/src/lib/permission-codes.ts` 提供 `PERMISSION_CODE`
  常數與 `PermissionCode` 型別，比照既有的 `role-codes.ts`。
  `_nav-items.ts` 的 `requiredPermission` 型別由 `string` 收緊為 `PermissionCode`。
- **新增 `RequirePermission` 守衛**，形狀比照既有的 `RequireRole`，
  套用到有對應權限的路由上。
- **沒有權限時就地顯示說明**（狀態 + 出路 + 缺少的權限碼），不再靜默導頁。
  ⚠️ **`RequireRole` 一併改成同樣的行為**——否則 codebase 會有兩種「沒權限」的表現。
- **兩條守則**：前端的權限碼必須存在於後端目錄；
  路由與 sidebar 對同一個 path 宣告的權限碼必須一致。

## Capabilities

### Modified Capabilities

- `platform-frontend-conventions`：「路由保護」從只管登入狀態，
  擴充為登入 + 權限 + 角色三層，並定義沒有權限時的呈現。

### Added Capabilities

- `platform-engineering-guardrails`：新增「前端的權限碼必須對得上後端目錄」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| API 契約 / Swagger | 無 |
| 後端 | 無（後端本來就擋得住，這次不動它） |
| 前端 | 新增一支守衛元件與一份常數；`RequireRole` **行為變更** |

⚠️ **`RequireRole` 的行為變更是知情的**：security 頁面現在對非 SUPERADMIN
是靜默導回首頁，改後會顯示「此帳號無對應權限」。
代價是**洩漏了「這個頁面存在」**——但 sidebar 本來就藏著它，
而會手動輸入該網址的人已經知道它存在了（見 design D3）。
