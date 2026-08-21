## ADDED Requirements

### Requirement: 檢舉審閱的路由與導航

`apps/web/` SHALL 提供 `/moderation/reports`（佇列）與 `/moderation/reports/:reportId`（詳情）
兩條路由，並在 Sidebar 加入導向佇列頁的選項。

- 兩條路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 新增「檢舉審閱」項目，連到 `/moderation/reports`，
  圖示使用 `lucide-react` 的 `Flag`，group 為「聊天管理」。
- 使用者沒有 `BACKEND:MODERATION:VIEW` 權限時 MUST NOT 看到該 Sidebar 項目；
  直接造訪任一路由 MUST 導向 `/`。

#### Scenario: 有 VIEW 權限的使用者進入佇列

- **WHEN** 使用者點 Sidebar 的「檢舉審閱」
- **THEN** 路由跳轉到 `/moderation/reports`，渲染檢舉列表

#### Scenario: 無 VIEW 權限直接打 URL

- **WHEN** 使用者在網址列輸入 `/moderation/reports/<某個 id>`
- **THEN** 自動導向 `/`，不發出任何 API 請求

### Requirement: 檢舉佇列列表

`/moderation/reports` SHALL 以 DataTable 顯示檢舉清單，**6 欄**：
檢舉人 / 被檢舉人 / 原因 / 狀態 / 檢舉時間 / 操作。

- 「檢舉人」「被檢舉人」MUST 顯示 email。email 為 `null`（帳號已刪除）時
  MUST 顯示「已刪除的帳號」並附 id 尾 8 碼，MUST NOT 顯示空白。
- 「原因」MUST 把 enum 轉成中文：`HARASSMENT` → 騷擾、`SPAM` → 洗版、
  `INAPPROPRIATE` → 不當內容、`OTHER` → 其他。
- 「狀態」MUST 以 shadcn `Badge` 顯示：`PENDING` → 待處理、`REVIEWED` → 已處理、
  `DISMISSED` → 已駁回。
- 「檢舉時間」MUST 顯示相對時間，hover 顯示絕對時間 ISO 字串。
- 狀態篩選 MUST 提供，且**預設為待處理**——審閱的入口問題永遠是「還有什麼沒處理」。
- 分頁與篩選狀態 MUST 同步到 URL query，重新整理後保持。
- 「操作」欄 MUST 提供「檢視」，導向該筆的詳情頁。

列表 MUST NOT 顯示任何訊息內容——後端本來就不回 `contentSnapshot`，
前端也 MUST NOT 從其他來源補齊。

#### Scenario: 預設載入

- **WHEN** 使用者進入 `/moderation/reports`
- **THEN** 顯示 `status=PENDING` 的檢舉，由新到舊

#### Scenario: 被檢舉人帳號已刪除

- **WHEN** 某列的 `targetMemberEmail` 為 `null`
- **THEN** 該欄顯示「已刪除的帳號」與 id 尾碼，該列其餘資訊照常顯示

#### Scenario: 切換狀態篩選

- **WHEN** 使用者切到「已處理」
- **THEN** 重新查詢並把 `status=REVIEWED` 寫進 URL query

#### Scenario: 佇列為空

- **WHEN** 沒有符合條件的檢舉
- **THEN** 顯示空狀態文案，MUST NOT 顯示錯誤

### Requirement: 檢舉詳情頁

`/moderation/reports/:reportId` SHALL 顯示單筆檢舉的完整內容與處置動線。

頁面 MUST 包含：檢舉資訊（當事人 email、原因、補充說明、檢舉時間、目前狀態）、
被檢舉訊息的內容快照、被檢舉者的行為時間軸、處置動作區、判定表單。

- 內容快照 MUST 標示它是**檢舉當下的快照**，而非訊息的現況——
  兩者可能不同（訊息可能已被撤回或編輯過），不標示會讓管理員誤判他看到的是現況。
- `targetMessageRemovedAt` 不為 `null` 時 MUST 顯示「此訊息已於 <時間> 被移除」。
- 檢舉已判定（`status` 非 `PENDING`）時 MUST 顯示判定結果、判定時間與處理註記。
- 查無此檢舉（`404`）時 MUST 顯示「檢舉不存在」而非空白畫面，並提供返回佇列的連結。

#### Scenario: 開啟一筆待處理的檢舉

- **WHEN** 管理員從佇列點「檢視」
- **THEN** 顯示完整內容，含快照、時間軸與可用的處置動作

#### Scenario: 開啟一筆已判定的檢舉

- **WHEN** 該筆 `status` 為 `REVIEWED`
- **THEN** 顯示判定結果與註記，判定表單 MUST 仍可用（終態間可更正）

#### Scenario: 檢舉不存在

- **WHEN** 網址中的 `reportId` 查不到
- **THEN** 顯示「檢舉不存在」與返回佇列的連結

### Requirement: 詳情頁 MUST NOT 預先載入

查看檢舉詳情**每次都會在後端寫入一筆 `REPORT_VIEWED` 稽核**，稽核量必須與
「實際看到敏感內容的次數」對齊。

- 佇列頁 MUST NOT prefetch 任何檢舉的詳情（含 hover 預載、可視區域預載）。
- 詳情查詢 MUST 明確設定 `staleTime`，避免切換瀏覽器分頁回來時重新請求。
- MUST NOT 因為元件重繪而重打詳情端點。

**這條規則看程式碼看不出來**：一個 prefetch 只有一行，加上去之後畫面更順、
沒有任何測試會變紅，而稽核紀錄從此失去意義——它會記錄一堆沒有人真的看過的「查看」。

#### Scenario: 在佇列頁 hover 某一列

- **WHEN** 滑鼠移過列表中的某筆檢舉
- **THEN** MUST NOT 發出該筆的詳情請求

#### Scenario: 切走再切回瀏覽器分頁

- **WHEN** 使用者離開分頁後回到詳情頁
- **THEN** MUST NOT 重新請求詳情，稽核只留原本那一筆

### Requirement: 處置動作

詳情頁 SHALL 提供四個處置動作：移除訊息、還原訊息、停權成員、解除停權。
全部需要 `BACKEND:MODERATION:EDIT` 權限。

- 使用者只有 `BACKEND:MODERATION:VIEW` 時，處置動作 MUST disabled
  並以 tooltip 說明「無處置權限」，MUST NOT 隱藏——隱藏會讓人以為功能不存在。
- 「移除訊息」與「還原訊息」MUST 依 `targetMessageRemovedAt` **二選一顯示**，
  MUST NOT 同時出現。
- 每個動作 MUST 先經確認對話框，對話框 MUST 說明後果
  （停權會斷開該成員既有的 WebSocket 連線）。
- 動作成功後 MUST 重新查詢詳情，MUST NOT 使用 optimistic update——
  這些動作對真人有實質影響，而 optimistic update 的本質是「先假設成功」。
- 動作失敗時 MUST 顯示後端回傳的錯誤訊息，並保持畫面狀態不變。

#### Scenario: 移除一則訊息

- **WHEN** 有 EDIT 權限的管理員按下「移除訊息」並確認
- **THEN** 呼叫 `DELETE /moderation/messages/:messageId`，成功後重查詳情，
  按鈕變為「還原訊息」

#### Scenario: 只有 VIEW 權限

- **WHEN** 使用者沒有 `BACKEND:MODERATION:EDIT`
- **THEN** 四個處置動作皆 disabled 並顯示 tooltip

#### Scenario: 停權的確認對話框

- **WHEN** 管理員按下「停權成員」
- **THEN** 對話框說明此操作會使該成員無法登入**並中斷其既有的即時連線**

#### Scenario: 處置失敗

- **WHEN** 後端回傳錯誤
- **THEN** 顯示錯誤訊息，畫面狀態不變，不假裝成功

### Requirement: 判定表單

詳情頁 SHALL 提供把檢舉標記為「已處理」或「已駁回」的表單，需 `BACKEND:MODERATION:EDIT`。

- 表單 MUST 使用 react-hook-form + zod + `standardSchemaResolver`。
- 處理註記 MUST 為選填、上限 500 字，超過時 MUST 在前端擋下並提示。
- MUST NOT 提供「回到待處理」的選項——後端不接受，前端提供它只會製造必然失敗的操作。
- 送出成功後 MUST 重查詳情並提示成功。

#### Scenario: 標記為已處理

- **WHEN** 管理員選「已處理」、填入註記並送出
- **THEN** 呼叫 `PATCH /moderation/reports/:reportId`，成功後畫面顯示新狀態與註記

#### Scenario: 註記超過 500 字

- **WHEN** 註記輸入 501 字
- **THEN** 前端擋下並提示字數上限，MUST NOT 送出請求

#### Scenario: 沒有回到待處理的選項

- **WHEN** 檢視判定表單的可選項
- **THEN** 只有「已處理」與「已駁回」

### Requirement: 被檢舉者的行為時間軸

詳情頁 SHALL 在側邊顯示被檢舉者的行為時間軸，資料來自
`GET /moderation/members/:memberId/timeline`。

- 時間軸 MUST 顯示動作類型（中文）、相關房間、時間，由新到舊。
- MUST 只載入第一頁並提供分頁控制，MUST NOT 使用無限捲動。
- 該成員沒有任何紀錄時 MUST 顯示空狀態，MUST NOT 顯示錯誤。
- 時間軸 MUST NOT 顯示任何訊息內容——稽核紀錄本來就不存內容，
  前端也不得從其他端點補齊。

放在詳情頁內而非另開頁面的理由：判斷「初犯還是慣犯」是做判定的**當下**就要有的資訊，
需要跳頁去看的資訊在實務上等於沒有。

#### Scenario: 被檢舉者有行為紀錄

- **WHEN** 詳情頁載入
- **THEN** 側邊顯示該成員最近的行為，由新到舊

#### Scenario: 被檢舉者沒有紀錄

- **WHEN** 該成員從未產生稽核紀錄
- **THEN** 顯示「無行為紀錄」，不視為錯誤
