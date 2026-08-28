## Why

**改了一個角色的權限，該角色的成員最多五分鐘之後才會生效。**

`ResolveMemberContextService` 把 `MemberContext`（含 `permissions`）快取在 Redis，
TTL 取「token 剩餘效期」與 `PERMISSION_CACHE_TTL`（預設 300 秒）的較小值。
帳號層的變更都有清快取：`UpdateMemberService`、`LogoutService`、
`RefreshTokenService`、`ResetPasswordService` 各自呼叫 `clearMemberContext`。

**只有角色層沒有。** `UpdateRoleService` 改完 `role_permissions` 就結束了，
沒有任何人通知那些成員的快取。

兩個方向的後果不對稱：

- **加權限**：使用者要等最多 5 分鐘才用得到。麻煩，但安全。
- **拿掉權限**：**他繼續用得到最多 5 分鐘**。而會急著拿掉某人權限的場合，
  正是最不能等的那種場合。停用角色（`status: false`）同樣如此。

這不是效能問題，是**授權變更沒有生效**。而它完全沒有徵兆——
畫面上顯示權限已經改了，稽核也記了，只有實際行為還是舊的。

順帶修一個結構問題：`MemberContext` 這份快取由
**兩個不同的 adapter** 經手——`RedisMemberContextCacheAdapter` 寫、
`RedisTokenBlacklistAdapter` 刪。同一份資料的生命週期散在兩個沒有關係的類別裡。

## What Changes

- **`UpdateRoleService` 在角色的權限或狀態變更後，清除該角色所有成員的
  `MemberContext` 快取。**
- **`ClearMemberContextPort` 併回 `MemberContextCachePort`**：一份快取由一個 port
  負責 get / set / clear，實作也回到 `RedisMemberContextCacheAdapter`。
  `RedisTokenBlacklistAdapter` 不再碰它。
- **新增批次清除**（`clearMany`）與 `RoleRepositoryPort.findMemberIdsByRole`。
- **新增守則**：改動角色權限或狀態的 service 必須清除成員快取——
  盯的是銜接點而非某個實作，日後多一條路徑（批次改權限、匯入工具）同樣會被要求。

**不做**：

- **不縮短 `PERMISSION_CACHE_TTL`**。那只是把「錯多久」調小，沒有解決「會錯」，
  而代價是每個請求都更常打資料庫。見 design D1。
- **不改成每次請求都查資料庫**（拿掉快取）。這條路徑服務**所有**已認證的請求，
  拿掉它是一個沒有量測支撐的效能決定。
- **不做角色快取的版本號機制**（cache key 帶 roleVersion）。它能省下「列出成員」
  那一步，但要在每次讀取時多比對一次版本，而目前的成員數規模不需要。見 design D2。
- **不動前台**：`UserContext` 沒有角色與權限的概念，不受影響。

## Capabilities

### Modified Capabilities

- `api-role-management`：更新角色的權限或狀態時，該角色成員的既有 session
  必須立即反映新的權限。

## Impact

- **無 schema 變動、無 migration、無新環境變數。**
- **後端**：`UpdateRoleService` 多兩個相依；`MemberContextCachePort` 增加
  `clearByMemberId` / `clearMany`；`ClearMemberContextPort` **刪除**
  （四個既有呼叫端改指向 `MemberContextCachePort`）。
- **`RedisTokenBlacklistAdapter` 不再實作 `clearMemberContext`**——
  那是這次一併修掉的結構問題。
- **效能**：更新角色時多一次「查該角色的成員 ID」與一次批次 `DEL`。
  角色的成員數是後台帳號規模（目前個位數），成本可忽略。
- **前端**：無變動。改角色權限之後的行為變得符合預期，不需要任何配合。
