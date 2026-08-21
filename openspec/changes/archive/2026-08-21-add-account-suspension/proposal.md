## Why

寫這個 change 之前先查了現況，結果**與預期不同**：停權的一半早就存在了。

`PATCH /api/admin/members/:id { status: false }` 已經會停用帳號並清除 context 快取，
而 `ResolveMemberContextService` 對 `!status` 直接拋 `AccountDisabledException`——
HTTP 與 WS 共用同一份判定，所以**登入與新的請求都擋得住**。

**但既有的 WebSocket 連線不會斷。**

連線層的認證只在 `handleConnection` 做一次，之後每個事件只驗房間成員資格；
心跳也不重驗。也就是說：

> **被停權的人，只要連線還開著，就能繼續送訊息。**

這是一個實際存在的漏洞，而且它剛好落在「每一層都正確、但沒有人負責銜接」的縫隙裡：
帳號停用做對了、WS 認證做對了、房間授權做對了，
只是沒有人規定「帳號狀態變了，既有連線怎麼辦」。

## What Changes

- **停權時主動斷開該成員的所有 WebSocket 連線**——跨實例，透過既有的
  `EventPublisherPort` 推播到個人房間
- 新增 `server:sessionRevoked` 事件，讓客戶端知道為什麼被斷線（而不是當成網路問題重連）
- 停權／解除停權留稽核（`MEMBER_SUSPENDED` / `MEMBER_REINSTATED`）
- 後台新增 moderation 側的停權入口（`BACKEND:MODERATION:EDIT`），
  與既有的帳號管理（`BACKEND:ACCOUNT:EDIT`）**並存**——理由見 design.md D3
- 新增守則：連線層的認證狀態變更必須能中止既有連線

## Capabilities

### New Capabilities

- `api-account-suspension`：停權與解除的 REST 契約
- `ws-session-revocation`：連線撤銷的即時推播契約

### Modified Capabilities

- `platform-websocket-transport`：新增「認證狀態變更必須中止既有連線」的需求
- `platform-observability`：稽核動作新增停權與解除

## Impact

- **無資料庫 migration**——沿用既有的 `members.status`
- **既有的 `PATCH /api/admin/members/:id` 行為改變**：把 `status` 改為 `false` 時
  現在會一併斷開該成員的 WS 連線。這是**修正而非新功能**
- 前台需處理 `server:sessionRevoked`（不要當成網路問題自動重連）
- 無新環境變數
