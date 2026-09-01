## Why

兩個各自獨立的收尾項，共同點是**沒有任何東西會提醒你它們還沒做完**。

**① 5 份 master spec 的 `## Purpose` 還是佔位字串。**
`api-dashboard`、`ui-dashboard`、`ui-member-profile`、`ui-room-overview`、
`ui-moderation` 的 Purpose 都是 `TBD - created by archiving change X.
Update Purpose after archive.`——`openspec archive` **只合併 `## Requirements`**，
Purpose 是它留給人補的，而 `openspec validate --specs --strict` 不會抓（39/39 全過）。
於是「補 Purpose」這件事從封存那一刻起就沒有任何提醒，5 份累積下來沒人發現。

Purpose 不是裝飾：讀 spec 的人先讀它決定要不要往下讀，而
`TBD - created by archiving` 傳達的訊息是「這份文件沒寫完」，
讀者會合理地不信任底下的內容。

**② `BACKEND:MODERATION:VIEW` 的顯示名稱低估了它的範圍。**
它叫「後台-檢舉審閱-檢視」，但實際上它同時是**營運總覽、檢舉審閱、聊天室**
三個頁面的門檻。`improve-permission-tree-legibility` 把群組標題改成「聊天管理」
之後這個落差變得明顯：群組叫聊天管理，底下第一項卻叫檢舉審閱。
只想給人看營運總覽的管理者，得勾一個寫著「檢舉審閱」的東西。

## What Changes

- **補完 5 份 master spec 的 `## Purpose`**，內容依各自的 Requirements 實際涵蓋範圍撰寫。
- **新增守則擋住 `TBD` Purpose**：`openspec-spec-format.spec.ts` 加一條——
  master spec 的 Purpose 不得為空、不得含 `TBD`。
  **這兩件事必須同一個 change**：補完之前那條守則會是紅的。
- **`BACKEND:MODERATION:VIEW` 的顯示名稱改為「後台-聊天管理-檢視」**，
  與它實際涵蓋的三個頁面一致。`MODERATION:EDIT` 維持「後台-檢舉審閱-判定」
  ——那個不對稱是刻意的，見 design D2。

**不做**：不動任何權限碼、守衛、路由（見 design D2）；
不重寫 5 份 spec 的 Requirements（只補 Purpose）。

## Capabilities

### Modified Capabilities

- `platform-engineering-guardrails`：新增「master spec 的 Purpose 必須寫完」。
- `ui-role-management`：新增「權限名稱必須反映該權限碼實際涵蓋的範圍」——
  記錄 VIEW 與 EDIT 在同一組內名稱不對稱是刻意的，避免下一個人「修正」回去。

> **5 份 Purpose 不會出現在 `specs/` 的 delta 裡。** openspec 的 delta 機制只處理
> `## Requirements`，Purpose 是 master spec 的內容，只能直接編輯。
> 這正是問題①的成因，也是為什麼要用守則而不是靠流程來擋。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| 權限碼 | **無新增、無移除**。只改一個 `name` 顯示字串 |
| 部署相依 | **需重跑 `pnpm --filter @app/api db:seed`**——`name` 改了要同步到 DB |
| API 契約 / Swagger | 無 |
| 前端 | 無程式碼變更（畫面上的字來自 DB） |
