## Why

`tasks/todo.md` 裡「可以直接動」的三項全部清掉。三者互不相關，
共通點只有「都卡在一個要先做出來的判斷」，而那個判斷現在都已經有答案了。

**① 營運快照每 5 秒跑兩個無界 `COUNT(*)`**（第三輪審查問題 1）。
`countRooms()` 完全沒有 WHERE、`countUsers()` 的 `deletedAt` 沒有索引。
`improve-admin-orientation`（#30）之後首頁也打同一支，而首頁是登入後的落點。
三條修法（加索引 / 讓它 index-only scan / 整份快照快取）各有代價，
而**現在還不知道哪個 count 貴**——所以本次**只加觀測，不改索引**。

**② master spec 的 `openspec validate --specs --strict` 有 7 支紅。**
查下去發現不是「忘了寫 SHALL/MUST」——**validator 只讀 requirement 開頭段落的第一行**，
而本專案的排版在 80 字左右斷行，normative 關鍵字落在第二行就等於沒寫。
七條全是這個形狀，其中兩條（`ui-moderation` #3、`ui-member-profile` #3）
是開頭先寫背景、MUST 在後面的項目符號裡。

**③ IP 白名單啟用後沒有恢復路徑。** `ip_whitelist` 為空時 guard fail-closed，
於是**能加白名單的後台 UI 自己也 403**。#40 之後健康檢查不再被擋
（服務起得來、403 說得出原因），但「把自己加回白名單」仍然只能直接動資料庫。

## What Changes

- **①** `MetricsPort` 加一個直方圖：營運快照的**每個查詢各自**的耗時，
  標籤是封閉集合的查詢名。`GetDashboardSnapshotService` 逐項量測。
  **不改任何索引、不加快取**——那要等這個指標有資料之後再決定。
- **②** 把七條 requirement 改成**開頭第一行就是 normative 陳述**，
  背景與細節移到後面。新增守則：master spec 的每個 requirement，
  開頭段落的第一行必須含 `SHALL` / `MUST` / `MAY`。
- **③** 啟動時若「白名單啟用且清單為空」，記一筆 **error 層級**的日誌說明
  所有使用者流量將被拒、以及怎麼恢復。另提供 seed 指令新增白名單項目。
  ⚠️ **不改 fail-closed，也不做「空清單就放行」**——那會讓開關形同虛設。

## Capabilities

### Modified Capabilities

- `platform-observability`：新增「營運快照的查詢成本必須可觀測」。
- `platform-engineering-guardrails`：新增「master spec 的 requirement
  必須在開頭第一行表態」。
- `api-security-management`：新增「IP 白名單啟用時必須有可恢復的路徑」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無新增 |
| API 契約 / Swagger | 無 |
| 前端 | 無 |
| 行為變更 | 多一個 Prometheus 指標；白名單設定不當時啟動日誌會出現一筆 error |

⚠️ **①刻意不修效能問題**。本次只讓它可測量。
「先加觀測再選方案」是這個專案自己在 `ResolveUserContextService` 示範過的判斷——
三條路各有代價，而挑錯的成本高於多等一個週期。

⚠️ **②的七支 master spec 改動不走 delta spec**，理由見 design D2——
那是純排版，零語意差異。若你認為仍該走 delta，說一聲，我補七份完整 requirement。
