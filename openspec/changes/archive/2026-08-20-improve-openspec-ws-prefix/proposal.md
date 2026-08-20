## Why

M2 的 WebSocket 事件契約**沒有地方可寫**。

能力名稱只認 `api-` / `ui-` / `platform-` 三類前綴。`api-` 是「後端 endpoint 契約」，強制每個宣告 endpoint 的需求寫出 HTTP 請求與 Success / Failure Response；WS 事件沒有 status code、沒有 URL、沒有 method，硬套會寫出 `Request: N/A` 這種假東西。`platform-` 描述工程約束，不適合承載 `sendMessage` 的 payload 形狀與 ack 回應。

**更糟的是「硬用 `api-` 其實會通過」**：`api-*` 的請求／回應檢查只對「內文第一行是 `` `METHOD /path` ``」的需求生效，WS 事件不會長那樣，所以機制上根本不會被檢查。能通過不代表應該這樣做——那會讓同一支 spec 裡兩種需求受到兩種待遇，而且從外面看不出來。這正是本專案反覆記載的缺陷型態：**規則存在、看起來有守著、實際上放行**。

## What Changes

- 能力前綴新增第四類 **`ws-`**（WebSocket 事件契約），`ws-` **不分前後台側**——WS 只服務終端使用者，後台的即時儀表板走 SSE
- 新增格式檢查：`ws-*` 中宣告事件的需求必須寫出該方向所需的區塊
  - `` `client:<event>` `` （客戶端送入）→ **Payload**、**Ack**、**Failure Responses**
  - `` `server:<event>` `` （伺服器推送）→ **Payload**
- `ws-*` **MUST NOT** 使用 `**Success Response**`——那是 HTTP 的形狀，混用會讓「非 api- 不得寫 API 回應區塊」那條反向檢查失去意義
- `openspec/schemas/spec-driven-custom/schema.yaml` 的 specs instruction 同步（那是 `openspec instructions` 餵給 AI 的格式規範，不同步的話產出的 spec 不會照做）
- `openspec/project/openspec-conventions.md` 的前綴表同步

## Capabilities

### Modified Capabilities

- `platform-engineering-guardrails`：「master spec 的命名與格式檢查」需求擴充——前綴白名單加入 `ws-`，並新增 `ws-*` 事件契約的必填區塊檢查

## Impact

- **無程式碼改動**：僅架構守則、schema instruction 與文件
- **既有 16 支 master spec 不受影響**：沒有任何一支以 `ws-` 開頭，新增的檢查不會回頭要求既有 spec 改寫
- **M2 解除阻塞**：事件契約有了名副其實的歸屬與強制格式
- 護欄項數增加（`openspec-spec-format.spec.ts` 新增斷言）
