> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由加 `pnpm --filter @app/api test:e2e`；
> 動到 module 接線加 `pnpm build`。
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
>
> **塊的依賴**：
> 塊 1（合併 port）是純粹的搬移，**它動到四支既有 service，但行為完全不變**。
> 塊 2 依賴塊 1（要用合併後的 port 加批次清除）。
>
> **這個 change 沒有 schema 變動、沒有環境變數、沒有 migration。**

## 1. 合併 `ClearMemberContextPort` 進 `MemberContextCachePort`

- [x] 1.1 `MemberContextCachePort` 增加 `clearByMemberId(id)` 與
      `clearMany(ids)`（空陣列 MUST 是無操作，不要送一個空的 `DEL`）
- [x] 1.2 `RedisMemberContextCacheAdapter` 實作兩者
- [x] 1.3 ⭐ `RedisTokenBlacklistAdapter` **移除** `clearMemberContext` 與
      `buildMemberContextKey` 的 import——它回到只做黑名單。
      刪除的實作長在一個叫「token 黑名單」的類別裡，與它的名字毫無關係，
      而代價是「要為快取加批次刪除時，第一個打開的檔案裡沒有刪除」
- [x] 1.4 刪除 `ClearMemberContextPort.ts`；四支既有呼叫端
      （`LogoutService` / `RefreshTokenService` / `ResetPasswordService` /
      `UpdateMemberService`）改注入 `MEMBER_CONTEXT_CACHE_PORT`
- [x] 1.5 `redis.module` 與各 module 的 provider／import 跟著調整
- [x] 1.6 ⭐ **驗收標準**：那四支 service 的既有 `.spec.ts`，
      **斷言一條都不改**——誰被呼叫、帶什麼參數、什麼情況下不該被呼叫，全部照舊。
      可以改的只有型別 import 路徑與 mock 的方法名（`clearMemberContext`
      → `clearByMemberId`）。斷言改到了才代表不是搬移
- [x] 1.7 驗證：`pnpm typecheck && pnpm lint && pnpm test && pnpm build` 皆 exit 0

## 2. 更新角色時清除成員快取

- [x] 2.1 `RoleRepositoryPort` 增加 `findMemberIdsByRole(roleId)`——
      只回未軟刪除的成員 ID。形狀沿用既有的 `countMembers`
- [x] 2.2 `PrismaRoleRepository` 實作
- [x] 2.3 ⭐ `UpdateRoleService` 在 `updateWithPermissions` **成功之後**
      清除該角色所有成員的快取。順序不可顛倒：先清再寫的話，
      中間那一瞬間有請求進來會把舊值重新快取回去
- [x] 2.4 ⭐ **一律清，不判斷「這次改的是不是授權」**（design D6）：
      要判斷就得比對前後的權限集合，而那個比對寫錯的方向是**該清沒清**——
      一個沒有徵兆的失效
- [x] 2.5 ⭐ 清除失敗**不吞掉**，讓整個更新失敗（design D4）。
      判準：「這件事失敗了，之後的行為會不會是錯的」——會，所以不能吞
- [x] 2.6 ⭐ 新守則：呼叫 `updateWithPermissions` 的 service 必須清成員快取。
      沿用 `session-revocation.spec.ts` 的形狀——**只注入不呼叫不算**，
      重構時最容易留下的殘骸就是「呼叫被移除、注入忘了清」。
      合成輸入測試：兩者都有 → 通過；只有前者 → 抓出；只注入沒呼叫 → 抓出
- [x] 2.7 單元測試：清的是該角色的成員、空成員清單不呼叫 Redis、
      清除失敗會讓 execute 拋出
- [x] 2.8 驗證：`pnpm test` 全綠

## 3. E2E

- [x] 3.1 ⭐ **撤銷權限立即生效**：某帳號登入並成功打一支需要權限的端點
      （讓快取寫進去）→ 從他的角色移除該權限 → **同一個 token 再打一次要 403**
- [x] 3.2 ⭐ **授予權限立即生效**：同上反向，第二次要 200，且不必重新登入
- [x] 3.3 只改名稱也清——**改在快取層驗**：`MemberContext.roleName` 目前
      沒有任何端點會吐出來（`/api/admin/me` 走 `getMyProfile` 直接查 DB），
      HTTP 層驗不到差別。改成斷言該成員的快取 key 被刪掉，
      這正是「只在 permissionCodes 有給時才清」會踩到的那條線
- [x] 3.4 不影響其他角色：更新角色 A 之後，角色 B 的成員仍然用得到他的權限
- [x] 3.5 ⭐ **反向驗證**：
      (a) 拿掉 `UpdateRoleService` 的清除 → 3.1 要紅；
      (b) 把「一律清」改成「只在 permissionCodes 有給時才清」→ 3.3 要紅；
      (c) 拿掉守則要求的呼叫 → 守則要紅。三者還原後都要綠
- [x] 3.6 驗證：`TZ=UTC pnpm --filter @app/api test:e2e` exit 0

## 4. 收尾

- [x] 4.1 跑完整驗證鏈並貼出實際 exit code
- [x] 4.2 `smoke-test.md`：⭐ 含**只有人工驗得到的**——開兩個瀏覽器分頁，
      一邊用著後台、另一邊把他的權限拿掉，確認前一邊**下一次操作就被擋**
      而不是等五分鐘
- [x] 4.3 `openspec/project/backend-runtime.md`：把「哪些路徑會清 MemberContext 快取」
      補成完整清單（現在只寫了帳號層的）
- [x] 4.4 更新 `tasks/todo.md`：第 6 項打勾
- [x] 4.5 新踩到的坑寫進 `tasks/lessons.md`
- [x] 4.6 ⭐ `openspec archive fix-permission-cache-consistency`，
      並檢查 `api-role-management` 的 `## Purpose` 有沒有跟新的 Requirements 打架
