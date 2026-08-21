## Why

檢舉審閱的後端**整條做完了但沒有任何介面在用**——佇列、詳情、判定、移除、還原、
停權、解除、時間軸八個端點，目前只有 e2e 測試碰過，真人沒點過一次。
沒有介面的審閱功能等於沒有審閱功能。

而一接上前端就露出兩個後端落差，兩個都不是前端能自己解決的：

1. **檢舉的所有回應只回 UUID**（`reporterId` / `targetMemberId` / `roomId`）。
   前端逐列打 `/members/{id}` 補人名在**權限模型上直接不成立**：
   那支需要 `BACKEND:ACCOUNT:VIEW`，而審閱人員只有 `BACKEND:MODERATION:VIEW`，會 403。
   權限拆開是刻意的設計（客服能審檢舉但不該看得到帳號管理），
   所以要補的是檢舉端點自己的回應，不是叫前端去繞。
2. **詳情看不出被檢舉訊息目前是否已被移除**。管理員按下「移除訊息」之後，
   介面無從判斷該顯示「移除」還是「還原」——按鈕只能盲按。

這正是「先做前端才會逼出來」的那類落差：後端每一支端點單獨看都正確，
但沒有人站在使用者的位置檢查它們**合起來夠不夠用**。

## What Changes

- **後端**：檢舉佇列與詳情的回應補上 `reporterEmail` / `targetMemberEmail`。
  兩者皆可為 `null`——帳號可能已被刪除，而檢舉刻意沒有外鍵正是為了在那種情況下仍可審閱。
- **後端**：檢舉詳情補上 `targetMessageRemovedAt`，讓介面能正確切換「移除／還原」。
- **前端**：新增 `/moderation/reports` 檢舉佇列頁與 `/moderation/reports/:reportId` 詳情頁，
  完成「佇列 → 詳情 → 判定 → 處置」的閉環。處置含移除訊息、還原訊息、停權、解除停權。
- **前端**：詳情頁內嵌被檢舉者的行為時間軸（既有的 timeline 端點），
  讓「初犯還是慣犯」在做判定的當下就看得到，而不是另開一頁。
- **前端**：Sidebar 新增「檢舉審閱」項，依 `BACKEND:MODERATION:VIEW` 顯示。

**不做**（範圍外，各自獨立成 change）：SSE 即時儀表板、使用者 360 視圖、聊天室總覽。
儀表板與審閱動線沒有共用元件，綁在一起只會讓這個 change 難以驗收。

## Capabilities

### New Capabilities

- `ui-moderation`：後台檢舉審閱的前端行為——佇列頁、詳情頁、判定與處置動線、
  權限驅動的顯示、被檢舉者行為時間軸。

### Modified Capabilities

- `api-moderation`：「查詢檢舉佇列」與「查詢檢舉詳情」兩條需求的回應形狀擴充
  （補 email 與訊息移除狀態）。既有欄位不變，屬相容擴充。

## Impact

- **後端**：`ChatReportRepositoryPort` 的 `ChatReportListItem` / `ChatReportDetail` 型別、
  `PrismaChatReportRepository`、`LoadMemberPort`（新增一支批次查 email 的方法）、
  `ModerationService`、admin swagger 的 `list-reports.yaml` / `get-report.yaml` /
  `_report-list-item.yaml`。
- **前端**：新增 `apps/web/src/routes/moderation/`，`App.tsx` 加兩條路由，
  `_nav-items.ts` 加一筆。
- **api-client**：`schema.ts` 需重新產生（swagger 有變）。
- **無 migration**：所有新欄位都是既有資料的投影或關聯查詢，不動 schema。
- **無新環境變數**。
