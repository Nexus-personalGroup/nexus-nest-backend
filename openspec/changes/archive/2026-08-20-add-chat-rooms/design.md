## Context

M1 交付的 `joinGroup` 是佔位實作：

```ts
async handleJoinGroup(client, payload) {
  await client.join(payload.groupId);   // ← 沒有任何驗證
  client.emit(SERVER_EVENTS.GROUP_JOINED, { groupId: payload.groupId });
}
```

當時沒有房間資料可以驗證，所以它只做 socket room 的加入。M1 的範圍宣告寫明「不做任何聊天業務」，這是誠實的——但留下的是一個**任何已認證使用者都能竊聽任意群組**的狀態。

而且 `authorization-coverage` 的 WS 部分抓不到它：那條規則檢查「handler 有沒有表態認證」，`joinGroup` 表態了（class 層級的 `@WsAuthenticated()`）。**它遵守了所有現存規則，只是缺少沒有規則要求它有的東西**——本專案第三次遇到同一個型態。

## Goals / Non-Goals

**Goals:**

- 房間與成員關係的資料模型，含 1:1 私聊的唯一性保證
- **非成員無法加入房間的 socket room**（本 change 的驗收條件）
- 「WS 事件的資源存取必須經授權」由守則強制，不只是這次修好

**Non-Goals:**

- **不做訊息**：訊息、去重、ack、`seq`、斷線補齊全部屬於 `add-chat-messaging`。房間存在之後訊息才有可以據以授權的東西
- 不做房間的進階管理（改名、換管理員、封存）——先讓基本流程站得住
- 不做未讀計數（需要訊息才有意義）

## Decisions

### D1：房間 CRUD 走 REST，不走 WebSocket

**只有需要即時性的操作才走 WS。** 建立房間、查詢自己的房間列表都不是延遲敏感的——使用者按下「建立群組」等 200ms 與等 20ms 沒有差別。

走 REST 的實質好處是**沿用既有的全套護欄**：swagger 契約同步、api-client codegen、`authorization-coverage` 的端點檢查、`dto-from-zod`。WS 那側這些機制才剛建立，能少走一次就少一次。

**不選「全部走 WS」**（前一版專案的做法）：它把 `createGroup`、`getRooms` 都做成 WS 事件，結果 gateway 同時承擔 CRUD 與即時推送，是它長到 544 行的原因之一。

**WS 只保留兩件真的需要即時的事**：把連線加入／移出 socket room，以及成員變動的即時通知。

### D2：1:1 私聊的唯一性用正規化的 key 而非查詢比對

兩個人之間**只能有一個私聊房間**。用「查有沒有同時包含 A 和 B 的房間」來保證會有競態——兩邊同時開啟對話就會建出兩個房間，而且症狀是「訊息分裂在兩個房間」，很難察覺。

改用 DB 層的唯一性：房間表存一個 `directKey`，值為兩個 memberId **排序後**串接（`min:max`）。加上 unique index，第二次建立會撞 P2002，Repository 層轉成「回傳既有房間」。

群組房間的 `directKey` 為 `null`——Postgres 的 unique index 允許多個 null，天然不互相衝突。

**不選「用 (memberA, memberB) 複合 unique」**：那需要在寫入前決定誰是 A 誰是 B，等於把排序邏輯散在每個呼叫點；而且查詢時要寫兩個方向的 OR。

### D3：成員資格檢查放在 application 層，不放 gateway

`joinRoom` 的授權判斷是**業務規則**，不是傳輸細節。放在 gateway 會違反 M1 建立的「gateway 只做轉譯」，而那條有守則擋著（`layering.spec.ts` 涵蓋 `*Gateway.ts`）。

流程：gateway 驗證 payload → 呼叫 `JoinRoomUseCase` → service 查成員關係 → 不是成員就拋 domain exception → gateway 的 `WsExceptionFilter` 轉成錯誤事件。

**socket room 的實際加入動作仍在 gateway**——那是傳輸層操作，application 層不該碰 Socket.IO。service 回傳「可以加入」，gateway 才執行 `client.join()`。

### D4：新增守則——WS 事件的資源存取必須經授權判斷

修好 `joinGroup` 只解決這一次。**下一個接受 `roomId` 的 handler 會以完全相同的方式出錯**，因為沒有任何規則要求它做授權。

守則的判定：`@SubscribeMessage` 的 handler 若其 payload schema 含有資源識別碼（`roomId` / `messageId` 這類），該 handler MUST 呼叫 application 層（而非直接操作 socket）或明示豁免。

這與 HTTP 端「接受任意資源識別碼的端點必須表態授權」是同一條規則的 WS 版本。**本專案已經因為缺少這類「negative-space」規則出過附件 IDOR**——那次的 controller 通過了當時全部 18 支守則。

### D5：房間成員關係不做軟刪除

離開房間就是刪除成員關係列。**不用 `leftAt` 軟刪除**：軟刪除的價值在「需要還原」或「需要歷史」，而重新加入房間就是建立新的成員關係，不需要還原舊的；歷史則由 M3 的 `chat_audit_log` 負責，那才是它該待的地方。

軟刪除的代價是**所有查詢都要記得加 `leftAt: null`**，漏一次就會把已離開的成員算進去——本專案在 `deletedAt` 上已經有這條 lesson。房間成員是高頻查詢（每次授權判斷都要），少一個必須記得的條件是實質的簡化。

## Risks / Trade-offs

- **[破壞 M1 的整合測試]** M1 的跨實例測試用任意 `groupId` 加入房間，補上驗證後會全部失敗 → 這是**預期的**：那些測試驗的是廣播機制，改為先建立房間與成員關係即可。**不可為了讓測試過而放寬驗證**

- **[1:1 房間的 `directKey` 依賴呼叫端正確排序]** 排序寫錯會建出重複房間 → 排序封裝在 domain 層的單一函式，並有單元測試釘住「A,B 與 B,A 產生相同的 key」

- **[新守則可能誤判]** 「payload 含資源識別碼」的判定是靜態掃描，可能把不需要授權的欄位當成識別碼 → 比照既有守則提供豁免清單（須註明理由），並寫合成輸入的自我測試

## Open Questions

- **群組房間的成員上限**：先不設限。真的需要時再加，屆時有實際使用數據可以定值——現在訂一個數字只是猜測。

## 實作過程中的修正

寫下來是因為「文件與最後的程式碼一致」不等於「當初想的就是這樣」——
後者才是下一個人需要知道的。

### 路由改為 `/api/front/chat-rooms/*`

原設計寫 `/api/front/chat/rooms/*`。產生器 `gen:module chat-room --front` 產出的是
`chat-rooms`，而它同時註冊了 swagger 路徑。兩者取一時選了慣例：路徑分層本身沒有帶來
任何好處，而偏離產生器會讓之後每次重跑產生器都要手動修一次。

### `roomType` 改用 DB enum

原本是 `VarChar(16)` 加 TypeScript 聯集型別。實作時發現讀取端只能靠
`as ChatRoomType` 把 `string` 轉回聯集——那是騙過型別檢查，不是型別安全。
改成 Prisma enum 後非法值在寫入時就被 DB 擋下，讀取端的型別也自然收斂。

### 錯誤碼與 domain exception 必須同塊

tasks.md 原本把錯誤碼放塊 1、exception 放塊 3。`response-codes.spec.ts` 會擋下
「已註冊但無人使用」的死碼，於是塊 1 直接紅。這是鏈式依賴，切塊時漏看了。

### 新增 `@MemberScoped()` 與 `MemberPersistenceModule`

兩者都是既有守則擋下來才補的，不在原設計裡：

- `authorization-coverage` 要求接受資源識別碼的端點表態授權，而前台的授權是
  成員資格、不是權限碼。與其放寬規則，改為新增一個**只能用在前台**的表態方式。
- `side-isolation` 擋下前台 import `admin/member.module`。帳號的 out port 是共用的，
  它住在 `modules/admin/` 之下本來就是錯的位置，趁這次搬出來。

### `ChatRoomCoreModule` 的存在理由

原設計沒有這一層。WS gateway 需要成員資格判斷、前台的離開房間需要 WS 的事件送出端，
兩者放同一個模組會互相 import。把「只碰資料庫」的部分抽出來就打斷了循環。
