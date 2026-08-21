## Context

原本以為要從頭做停權，查了現況才發現**它的一半早就存在**（見 proposal）。
真正缺的是「帳號狀態變了，既有的 WS 連線怎麼辦」。

範圍是使用者選定的：**完全登不了**（不做禁言）、**只做永久停權，手動解除**（不做期限）。

## Decisions

### D1：不新增 `suspended` 欄位，沿用 `status`

一開始想新增獨立的停權欄位，理由是「離職員工」與「違規停權」語意不同——
那正是 `add-admin-message-removal` D1 的教訓（兩件事語意不同時不要共用欄位）。

**但那個教訓在這裡不適用**，差別在於：

- 撤回 vs 移除：**對使用者的行為表現不同**（顯示的文案不同、可否還原不同）
- 離職 vs 停權：**行為表現完全相同**——都是「登不了、既有連線斷開」

語意的差異在**為什麼**，而那已經有地方記了（稽核紀錄的 action 與 `reviewNote`）。
為了記錄「為什麼」而新增一個行為完全相同的狀態欄位，會製造兩個必須同步的真相來源：
每一支檢查 `status` 的程式碼都要記得也檢查 `suspended`，而**漏一支就是破口**。

判準是「**行為會不會不同**」，不是「概念上是不是同一件事」。

### D2：斷線用既有的個人房間推播，不新增基礎設施

每條連線在 `handleConnection` 時就會加入自己的個人房間（`member:{id}`），
而 `EventPublisherPort.publishToMember` 已經是跨實例的。

因此斷線的實作是：**推一個 `server:sessionRevoked` 到個人房間，
各實例的 gateway 收到後把自己持有的該成員連線斷開**。

**為什麼不直接用 Socket.IO 的 API 找連線**：那只能找到本實例的。
跨實例要嘛用 adapter 的 `fetchSockets()`（可行但繞）、要嘛自己做一套協調機制。
既有的推播路徑已經解決了同一個問題，重用它比新增一條路徑安全。

### D3：後台有兩個入口，刻意並存

停權可以從兩個地方觸發：

| 入口 | 權限 | 情境 |
| --- | --- | --- |
| `PATCH /api/admin/members/:id` | `BACKEND:ACCOUNT:EDIT` | 帳號管理（離職、停用） |
| `POST /api/admin/moderation/members/:id/suspend` | `BACKEND:MODERATION:EDIT` | 審閱處置（違規） |

**不把 moderation 那支做成帳號管理的別名**，也不強制統一到一個權限：
「能管帳號的人」與「能做審閱處置的人」是不同的角色。客服能停權違規者，
但不該能改帳號的角色與密碼；HR 能停用離職員工，但不該能看檢舉內容。

兩者最終呼叫**同一個 use case**，因此斷線與稽核的行為一致——
差別只在授權來源與稽核紀錄的 action。

### D4：`sessionRevoked` 要讓客戶端知道「不要重連」

Socket.IO 的客戶端預設會自動重連。如果只是斷線而不說原因，
被停權的客戶端會進入無盡的重連迴圈——每次都在 handshake 被拒，
而使用者看到的是「一直在連線中」而不是「你的帳號已停用」。

因此先送事件、再斷線，且事件要帶足夠的資訊讓客戶端停止重連。

**不在斷線的 reason 裡帶資訊**：Socket.IO 的 disconnect reason 是傳輸層的字串，
客戶端拿到的可能是 `io server disconnect`——那不足以區分「被停權」與「伺服器重啟」。

### D5：解除停權不主動通知，也不恢復連線

解除後使用者重新登入即可。

**不做「解除時推播讓他自動回來」**：他的連線已經斷了、token 也失效了，
沒有任何管道可以推給他。真要通知得走 email 或推播通知，那是另一個主題。

## Open Questions

- **停權的原因要不要記在帳號上**：目前只記在稽核紀錄。若日後要做申訴流程，
  「當初為什麼被停權」需要能查——但那時應該一併設計申訴，而不是現在先加一個欄位。
- **要不要限制停權者查看歷史**：目前停權後完全登不了，所以問題不存在。
  若日後改成「登得了但禁言」，這題才會出現。
- **管理員停權自己**：既有的 `UpdateMemberService` 已經擋了
  （`command.id === command.actorId && status === false`）。
  moderation 入口沿用同一個 use case，因此自動繼承這個保護。

## 為申訴流程預留了什麼

什麼都沒預留，這是刻意的。

申訴需要的是**新的資料表**（申訴紀錄、狀態、處理者），與停權本身沒有共用結構。
現在加任何欄位都是替一個還沒設計的東西猜規格。

真正留下的是稽核紀錄：`MEMBER_SUSPENDED` 帶著管理員、對象與時間，
申訴要回答的第一個問題「誰在什麼時候停了我」已經查得到。

## 實作過程中的修正

### 「停權自己」的狀態碼是 409，不是 400

spec 原本寫 `400`。實作時 e2e 紅了才發現既有的 `CannotDisableSelfException`
用的是 `CONFLICT`（409）。

**改 spec 去對齊既有行為，而不是改 exception**：那個 exception 同時服務
帳號管理的 `PATCH /api/admin/members/:id`，改它的 kind 會動到一個
與本 change 無關的端點的契約。審閱側的狀態碼好不好看，不值得那個代價。

### 撤銷用 `disconnectSockets()`，不用「各實例訂閱事件」

design.md D2 原本寫「各實例的 gateway 收到推播後斷開自己持有的連線」。
實作時發現 Socket.IO v4 的 `disconnectSockets()` **本身就是 adapter 感知的**
（與 `fetchSockets()` 一樣），配上 redis-adapter 就跨實例生效。

因此不需要各 gateway 訂閱，只要在 `EventPublisherPort` 多一個 `disconnectMember`。
少一套協調機制、少一個要維護的訂閱點。

**塊 2 的守則也跟著改了目標**：原本檢查「gateway 有沒有訂閱撤銷事件」，
改為檢查「**呼叫 `deactivate()` 的 service 有沒有撤銷連線**」。
後者才是真正的銜接點——日後多一條停用帳號的路徑（批次停用、自動風控、匯入工具），
它同樣會被要求撤銷連線，而「gateway 有沒有訂閱」對那些路徑無效。

### `MemberContextModule` 改 import `MemberPersistenceModule`

`MemberModule` 現在相依 `ChatWsModule`（停權要撤銷 WS 連線），
而 `ChatWsModule` → `MemberContextModule` → `MemberModule` 形成循環，
NestJS 啟動直接失敗（而且被整合測試的 `logger: false` 蓋住，只看得到 `process.exit(1)`）。

`MemberContextModule` 只需要 `LOAD_MEMBER_CONTEXT_PORT`，那在持久層模組就有。
**指向葉節點而非功能模組**——這與 `add-chat-rooms` 抽出 `ChatRoomCoreModule`
是同一個手法，沒有用 `forwardRef` 遮。

### `disconnectMember` 回傳 `void` 而非 `Promise<void>`

原本宣告成 `Promise<void>` 並在 service 裡 `await`。CI 的 lint 抓到
`@typescript-eslint/await-thenable`——`disconnectSockets()` 是同步的。

改成 `void` 不只是為了讓 lint 過：**宣告成 Promise 會讓呼叫端以為
`await` 之後所有實例都斷乾淨了，而那不是事實**。跨實例的部分經 adapter 廣播出去，
沒有完成訊號可等。型別要說實話。
