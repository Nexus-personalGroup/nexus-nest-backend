## Context

`ResolveMemberContextService` 是**所有已認證請求與 WS 連線**都會經過的那一支，
因此它的結果被快取在 Redis（`PERMISSION_CACHE_TTL`，預設 300 秒）。

帳號層的每一種變更都記得清快取。角色層一個都沒有——
`UpdateRoleService` 改完 `role_permissions` 就結束了。

這個 change 修的是**銜接點**，不是某個實作的 bug：
「角色的權限變了，那些成員的快取怎麼辦」這個問題從來沒有人回答過。

## Goals / Non-Goals

**Goals:**

- 更新角色的權限或狀態之後，該角色成員的**下一個請求**就拿到新的權限。
- 讓「某人的 `MemberContext` 快取」由**單一個 port** 負責整個生命週期。
- 加一條守則，讓日後新增的角色變更路徑同樣被要求清快取。

**Non-Goals:**

- **不調整 `PERMISSION_CACHE_TTL`**、**不拿掉快取**（見 D1）。
- **不做版本號式的快取失效**（見 D2）。
- **不處理前台**：`UserContext` 沒有角色與權限。
- **不改動任何既有的清快取路徑的行為**，只改它們注入的 port。

## Decisions

### D1：主動清除，不靠縮短 TTL

三個候選：

| 做法 | 評估 |
| --- | --- |
| **改完角色主動清成員快取** | 下一個請求就正確。成本是更新角色時多兩次查詢 |
| 縮短 `PERMISSION_CACHE_TTL` | 只是把「錯多久」調小，**沒有解決「會錯」**；而且每個請求都更常打資料庫，成本落在最熱的路徑上 |
| 拿掉快取 | 「正確」但把成本加在所有已認證請求上，且沒有任何量測支撐 |

選第一個。判準：**錯誤的授權不該有一個「可接受的持續時間」**。
把 300 秒調成 30 秒，撤銷權限依然有 30 秒不生效——那個數字沒有任何理由是安全的。

成本的方向也對：**角色變更是罕見操作，讀取是熱路徑**。把成本放在罕見的那一邊。

### D2：列舉成員後批次刪除，不做快取版本號

版本號的做法（cache key 帶 `roleVersion`，或快取內容存版本再比對）能省下
「列出該角色的成員」那一步，代價是**每一次讀取都要多查一次角色的版本**——
又把成本放回熱路徑上，而那正是 D1 要避免的。

列舉的成本上限是「一個角色的成員數」，而這是**後台帳號**的規模
（同事，不是客戶）。目前個位數。真的長到需要擔心時，`findMemberIdsByRole`
是唯一要改的地方，而那時會有實際的數字可以判斷。

**不用 scan pattern 刪除**：`presence-scan.spec.ts` 已經有一條守則禁止
在請求路徑上使用 keyspace 掃描，而更新角色是請求路徑。

### D3：`ClearMemberContextPort` 併回 `MemberContextCachePort`

現況是同一份 Redis key（`buildMemberContextKey`）由兩個 adapter 經手：

| 動作 | Port | 實作 |
| --- | --- | --- |
| get / set | `MemberContextCachePort` | `RedisMemberContextCacheAdapter` |
| clear | `ClearMemberContextPort` | **`RedisTokenBlacklistAdapter`** |

刪除的實作長在一個叫「token 黑名單」的類別裡，與它的名字毫無關係。
這種切法的代價不是難看，是**改動時容易漏**：要為快取加一個批次刪除，
第一個會被打開的檔案是 `RedisMemberContextCacheAdapter`，而它裡面沒有刪除。

合併之後一份快取由一個 port 負責 get / set / clear，
`RedisTokenBlacklistAdapter` 回到只做黑名單。

**這是本 change 唯一動到既有呼叫端的部分**（四支 service 換注入的 token），
行為完全不變——因此它們的既有測試必須**一行都不改就通過**。
改到了就代表不是純粹的搬移。

### D4：清快取失敗就讓整個更新失敗，不吞掉

`UpdateMemberService` 現況就是直接 `await`（沒有 catch），Redis 掛掉時整個更新失敗。
角色更新沿用同一個判準。

理由：這裡的失敗語意是「**權限改了但沒有生效**」。吞掉錯誤的話，
使用者看到「更新成功」而系統處於一個他不知道的狀態——
而這正是撤銷權限最不能接受的結果。**寧可讓他知道失敗了再按一次。**

（對比：稽核寫入失敗是 best-effort，因為那不影響任何人的實際權限。
判準是「這件事失敗了，之後的行為會不會是錯的」。）

### D5：守則盯的是「改了角色的授權」，不是某一支 service

沿用 `session-revocation.spec.ts` 的形狀：判定要求兩件事同時成立——
呼叫了角色的授權變更（`updateWithPermissions`），**且**呼叫了清快取。
**只注入不呼叫不算**——重構時最容易留下的殘骸就是「呼叫被移除、注入忘了清」。

沒有這條守則的話，日後多一條路徑（批次改權限、角色匯入、把 `isDefault`
的角色開放編輯）會安靜地重現同一個缺口。

### D6：更新角色一律清，不判斷「這次改的是不是授權」

`updateWithPermissions` 同時能改名稱、權限與狀態，而 `MemberContext`
**三者都帶**（`roleName` / `permissions` / 帳號可用性）——改名稱同樣會讓快取過時，
只是後果是顯示錯的名字而不是錯的授權。

要「只在授權真的變了才清」，就得比對前後的權限集合。那個比對本身是一個
會寫錯的地方（順序、重複、undefined 表示不變），而寫錯的方向是**該清沒清**——
一個沒有徵兆的失效。換來的只是省下一次罕見操作的批次 `DEL`。

因此不判斷，**一律清**。這條也讓守則好寫：規則變成「呼叫了
`updateWithPermissions` 就要清」，不需要理解參數的語意。

## Risks / Trade-offs

- **[角色成員很多時，一次更新要刪很多 key]** → 後台帳號的規模不會有那個問題；
  真的有時 `findMemberIdsByRole` 是唯一要改的地方（D2）。
- **[Redis 掛掉時角色更新會失敗]** → 刻意的（D4）。權限改了卻沒生效，
  比更新失敗更糟。
- **[併回 port 動到四支既有 service]** → 純粹搬移，它們的測試必須一行都不改就通過。
  這是可驗證的：改到了就代表不是搬移。

## Migration Plan

無 schema 變動、無環境變數、無資料遷移。部署後即生效。
