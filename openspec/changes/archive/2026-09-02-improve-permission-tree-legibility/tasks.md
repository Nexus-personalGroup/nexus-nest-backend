> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **但那三個指令驗不到「畫面上的字對不對」**——真正的驗收是開角色編輯 dialog 看一次（第 4 塊）。
>
> ⚠️ **改了 `PERMISSION_CATALOG` 的 `name` 一定要重跑 seed**：畫面讀的是 DB，
> 不重跑會出現「程式碼改了、畫面沒變」而查不到原因。指令在 4.1。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
>
> **塊的依賴**：第 3 塊的守則在第 1、2 塊完成前就會是綠的（它擋的是未來的漂移），
> 但第 1 塊必須先於第 3 塊——否則「對照齊全」那支守則沒有對照表可讀。
> 第 2 塊獨立。第 4 塊要前三塊都完成。
>
> **這個 change 沒有 schema、migration、環境變數、API 契約、權限碼變更。**

## 1. 權限樹中文化與名稱對齊

- [x] 1.1 `apps/api/src/shared/constants/permissions.ts`：`name` 對齊側邊欄用語
      ——「後台-帳號管理-*」→「後台-管理者帳號-*」、「後台-前台會員-*」→「後台-會員管理-*」。
      **其餘四組不動**（角色管理 / 附件 / 檢舉審閱維持原名）
- [x] 1.2 前端新增 platform 與 module 的中文對照（放 `roles/lib/`，與 `group-permissions.ts` 同層）：

      | code | 中文 |
      | --- | --- |
      | `BACKEND` | 後台 |
      | `ACCOUNT` | 管理者帳號 |
      | `ROLE` | 角色權限 |
      | `FRONT_USER` | 會員管理 |
      | `MODERATION` | 聊天管理 |
      | `ATTACHMENT` | 附件 |

- [x] 1.3 ⭐ 對照缺項時**退回顯示原始碼片段，不顯示空白**——空白標題的卡片
      看起來像壞掉，英文標題至少還能用
- [x] 1.4 `PermissionsField.tsx` 改用對照表顯示 `platform.platform` 與 `g.module`
- [x] 1.5 ⭐ `ATTACHMENT` 目前沒有任何後台頁面在用（見 design D4）。
      **在對照表旁邊寫註解說明**，不加「（尚無對應頁面）」之類的 UI 文字
      ——那是會隨功能上線而過期、卻沒有東西提醒你去改的字串
- [x] 1.6 前端單元測試：對照表命中與缺項 fallback 各一

## 2. 安全管理的不可指派區塊

- [x] 2.1 前端新增不可指派清單常數（IP 白名單 / IP 黑名單 / 帳號解鎖），
      含「限超級管理者」標示與 tooltip 文案
- [x] 2.2 `PermissionsField.tsx` 在一般區塊之後渲染該區塊：checkbox `disabled` 且不可勾選
- [x] 2.3 ⭐ tooltip 要說**為什麼**（能改 IP 名單等同能繞過所有 IP 層防護），
      不是只寫「無權限」——只寫無權限的話使用者會去要那個權限，而它要不到
- [x] 2.4 ⭐ 測試：點擊該區塊任一 checkbox 後 `permissionCodes` **不變**
      ——「disabled 但仍會進表單」是這種展示型區塊最典型的壞法
- [x] 2.5 測試：該區塊存在且三項皆 disabled

## 3. 兩支守則

- [x] 3.1 守則 A「模組中文對照齊全」：讀 `PERMISSION_CATALOG` 與前端對照表，
      雙向比對（缺對照 → 紅；對照有多餘項 → 紅）
- [x] 3.2 ⭐ 守則 A 要斷言**兩邊各自讀到非空集合**——掃不到就失敗，
      否則路徑改了規則會靜默空轉
- [x] 3.3 守則 B「不可指派清單與後端守衛一致」：斷言 `SecurityController`
      仍含 `@Roles(RoleCode.SUPERADMIN)`；讀不到該檔即失敗
- [x] 3.4 ⭐ 守則 B 的訊息要指出**前端有一段寫死的說明要同步移除**，
      而不只是說「守衛被改了」
- [x] 3.5 ⭐ **反向驗證 A**：對照表拿掉一項 → 紅；加一個不存在的 module → 紅；還原 → 綠
- [x] 3.6 ⭐ **反向驗證 B**：把 `SecurityController` 的 `@Roles` 註解掉 → 紅；還原 → 綠。
      **第一次是假的**：整體 exit code 確實變 1，但紅的是 `authorization-coverage`，
      我那支沒有去註解所以 `// @Roles(...)` 照樣比中。改用 `stripComments` 後
      「註解掉」與「整行刪掉」兩種破壞方式都會紅
- [x] 3.7 `guardrail-inventory.spec.ts` 若有數量斷言需同步

## 4. 驗收與收尾

- [x] 4.1 ⭐ **`pnpm --filter @app/api db:seed`**——`name` 改了要同步進 DB。
      `seed-permissions` 與 `seed-roles` 都是 `alwaysRun` upsert，重跑不會動到既有授權
- [x] 4.2 開角色編輯 dialog：群組標題全中文、名稱與側邊欄一致、
      安全管理區塊在最後且三項皆灰、hover 有理由
- [x] 4.3 ⭐ 勾一個 EDIT 確認 VIEW 仍自動勾選並鎖定（既有行為不得被本次改動弄壞）
- [x] 4.4 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.5 `openspec validate improve-permission-tree-legibility --strict` 通過
- [x] 4.6 `tasks/lessons.md`：補「反向驗證只看整體 exit code 會被別支守則的紅燈冒名頂替」——3.6 實際踩到
- [x] 4.7 `openspec archive improve-permission-tree-legibility`
