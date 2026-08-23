## Context

路線圖第 3a 項。使用者定下的兩個前提：前台使用者與後台帳號**分成兩張表**
（前台表名 `users`），以及**先修完審查報告的 🔴 再開分表工程**（已完成）。

3a 的範圍刻意收在「讓新體系能站著」：帳號能登入、token 分得出側別、
change 4 的遷移有東西可以指向。**不動任何既有路徑**——那是 change 4 的事。

## Decisions

### D1：`users` 只帶前台真正需要的欄位，不複製 `members`

`members` 有 15 個欄位，其中五個是 RBAC 與後台專屬的
（`roleId` / `lockedAt` / `isDefault` / `failedLoginCount` / `lastPasswordChange`）。
複製過來的話它們會永遠是預設值，然後在某次 code review 被誤讀成「有這個功能」。

`users` 的欄位與理由：

| 欄位 | 為什麼要 |
| --- | --- |
| `email`（unique） | 登入識別 |
| `password` | bcrypt hash |
| `displayName` | **聊天裡別人看到的名字**。沒有它，前台只能顯示 email——把每個人的信箱暴露給同房間的所有人 |
| `avatarUrl`（null） | 現在不做上傳，只留欄位。日後接附件上傳時直接用 |
| `emailVerifiedAt`（null） | 3b 才會真正用到，但**現在加比之後加 migration 便宜**。未驗證要不要擋登入是 3b 的決定 |
| `status` | 停權。與 `members` 同樣的語意，change 4 的「停權前台使用者」要用 |
| `tokenVersion` | 立即撤銷該帳號所有既發 token 的唯一機制 |
| `lastSeenAt`（null） | **與 presence 不同**：presence 是「現在在不在」（Redis、會消失），這是「上次什麼時候來過」（永久）。審閱與清理閒置帳號都用得到 |
| `createdAt` / `updatedAt` / `deletedAt` | 與既有慣例一致，軟刪除 |

**沒有 `lastLoginAt`**：前台的 session 是長效的，「上次登入」對前台的意義遠小於
「上次活動」，而後者就是 `lastSeenAt`。多一個意義重疊的時間欄位只會讓人問「該看哪個」。

**沒有帳號鎖定**：`members` 那套剛在 `fix-unauthenticated-surface` 被證明是
一個未認證者可以觸發的 DoS 面。前台的暴力破解防護交給既有的全域 throttle
與 `APPLICATION_IP_BLOCK_THRESHOLD`——per-IP 而非 per-account，那本來就是對的層級。

### D2：前後台用**各自的 secret**，`side` claim 是第二道

最直覺的做法是共用 secret、靠 `side` claim 分辨。審查報告的觀察 A 也是這樣建議的。
**這裡刻意不採用。**

差別在**忘記檢查時會發生什麼**：

| | 共用 secret + side claim | 各自的 secret |
| --- | --- | --- |
| 某處忘了比對 side | **跨側存取**（前台 token 過得了 admin 端點） | 簽章驗證失敗，**天然 fail-closed** |
| 新增受保護端點 | 必須記得表態 | 用錯 secret 就是驗不過 |

這個專案在其他地方（黑名單、限流）一貫選 fail-closed，這裡沒有理由選相反的。
「忘記」是一定會發生的事，重點是它發生時的預設結果。

代價是兩個新的必填 secret（production 共四組）。可接受——
它們與既有的 `ACCESS_SECRET` / `REFRESH_SECRET` 產生方式相同，
而部署平台注入四個與注入兩個沒有本質差別。

**`side` claim 仍然要有**，理由是可讀性與錯誤訊息：驗證失敗時能說出
「這是前台的 token」而不是只有一句「簽章無效」。它是第二道，不是唯一那道。

### D3：沒有 `side` 的舊 token 視為 admin

部署前簽出的 token 沒有這個欄位。兩條路：

- **拒絕**：所有人立刻被登出。對開發中的專案可以接受，對已上線的不行。
- **視為 admin**：舊 token 繼續有效直到自然過期。

選後者。**這是一個有時效的相容措施**：refresh token 效期 7 天，
所以部署滿 7 天後所有流通中的 token 都會帶 `side`，那時可以把「缺少 side」
改成拒絕。這句話寫進 spec 與程式碼註解，否則它會變成永久的後門。

注意這個相容性只對 admin 側有意義——前台 secret 是新的，
用它簽出來的 token 從第一天就一定帶 `side`。

### D4：前台的 context 是另一個型別，不是 `MemberContext` 的子集

`MemberContext` 帶 `roleName` / `roleCode` / `permissions`——全是 RBAC 概念。
前台使用者沒有角色也沒有權限碼，硬塞空陣列會讓
「permissions 是空的」同時代表「沒有權限」與「這個概念不適用」。

因此開一個平行的 `UserContext`：`sub` / `email` / `displayName` / `status` / `tokenVersion`。
兩者**不共用型別、不繼承**——它們碰巧有幾個同名欄位，但那不是抽象，是巧合。

同理，解析 token 的 use case 也是平行的兩支。共用一支再用參數分流，
會讓「前台的解析要不要查權限」這種問題每次都要重新想一遍。

### D5：3a 不切換任何既有路徑

`/api/front/chat/*` 與 WS 連線目前吃 admin token，**本 change 不動它們**。

理由是 change 4（聊天領域改指向 `users`）一旦開始就不能留半套狀態：
`chat_messages.senderId`、`chat_room_members.memberId`、presence key、
後台四個審閱頁、停權——全都要一起改。把切換塞進 3a 會讓這個 change
變成「順便做了一半的 change 4」。

**代價要說清楚**：3a 做完之後，觀察 A 只補了一半——
admin 端點會拒絕前台 token，但前台端點仍然接受 admin token。
另一半在 change 4。

### D6：登出沿用既有的 token 黑名單

黑名單以 token 本身為鍵、存 Redis，與哪一側簽的無關。前台登出直接複用，
不需要第二套。這是少數幾個**應該**共用的東西——因為它處理的是 token 這個載體，
而不是 token 背後的身分。

## Open Questions

- **`displayName` 要不要唯一**：不唯一（同名在聊天裡靠頭像與上下文區分，
  強制唯一會讓註冊體驗變差）。但這代表審閱時不能只靠顯示名認人，
  後台仍然看得到 email。
- **未驗證信箱要不要擋登入**：3b 的決定。3a 只存 `emailVerifiedAt`，不做任何判斷。

## 為什麼不共用 `members` 加一個側別欄位

那是成本最低的改法，但它把兩種很不一樣的實體壓在同一張表上：
一邊有角色與權限、密碼策略、帳號鎖定；另一邊有顯示名稱、頭像、信箱驗證。
兩邊的欄位對對方而言永遠是 null 或預設值。

更實際的問題是**查詢**：`listMembers` 之後每一支查詢都要記得帶側別條件，
而漏帶的後果是後台的使用者列表出現前台使用者——一個看起來只是「資料變多」的錯。
分表讓那件事在型別層面就不可能。
