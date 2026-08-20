## Context

M1 把連線層契約寫成 `platform-websocket-transport`（認證時機、presence 一致性、跨實例送達保證），那個歸屬是正確的——它們是工程約束。

但 M2 要寫的是不同性質的東西：`sendMessage` 收什麼、回什麼、失敗時給什麼錯誤碼。那是**契約**，不是工程約束。現有三類前綴沒有一類容得下它。

## Goals / Non-Goals

**Goals:**

- WS 事件契約有名副其實的歸屬，且格式由守則強制而非自律
- 新的檢查對既有 16 支 master spec 零影響

**Non-Goals:**

- 不改動既有 `api-` / `ui-` / `platform-` 三類的規則
- 不預先定義 M2 的事件內容——本 change 只建立「該怎麼寫」的框架
- 不處理 `ws-` 的前後台切分（見 D3）

## Decisions

### D1：新增 `ws-` 而非沿用 `api-`

**契約的形狀真的不同，不是同一種東西換個殼。**

HTTP 是請求-回應配對：一個 method、一個 path、一個 status code。WebSocket 是**雙向的訊息流**，而且兩個方向的形狀不對稱：

```
client:sendMessage   →  { roomId, content, clientMessageId }
                     ←  ack: { messageId, seq }  或錯誤碼
server:newMessage    ←  伺服器主動推送，沒有對應的請求
```

`server:newMessage` 這種**伺服器主動推的事件在 HTTP 的模型裡根本不存在**。硬塞進 `api-*` 的四段式（Request / Success / Failure / Scenario）只能寫出「Request: N/A」。

**而且硬用 `api-` 會通過守則**——`api-*` 的檢查以 `` `METHOD /path` `` 判定是否為 endpoint 需求，WS 事件不符合，直接 `continue` 跳過。同一支 spec 裡 HTTP 需求被檢查、WS 需求不被檢查，兩種待遇且無跡可循。

### D2：不放寬 `api-*` 去涵蓋非 HTTP 契約

技術上可行：把判定式擴充成「HTTP endpoint 或 WS 事件」，兩種各有必填區塊。

**不選的理由是名實**：`api-` 在文件、schema instruction、5 支既有 spec 裡都是「後端 endpoint 契約」。要它同時涵蓋非 endpoint，要嘛改名（波及既有全部）、要嘛留一個名字說 A 內容是 A+B 的分類。分類的價值在於「看到名字就知道裡面是什麼」，模糊化等於放棄那個價值。

### D3：`ws-` 不分前後台側

既有慣例是 `api-`（後台預設）/ `api-front-`（前台）。`ws-` 不比照：

- 聊天 WS 只服務終端使用者，**沒有後台對應面**
- M4 的後台即時儀表板走 SSE 不走 WS（M1 既定決策）
- 這與 `adapter/in/ws` 不分側的程式碼結構一致——同一件事在兩個地方要說同一句話

真的出現後台 WS 再新增 `ws-admin-`，屆時有具體需求可以判斷，比現在預先切分更準。

### D4：以方向標記判定事件需求，兩個方向各有必填區塊

沿用 `api-*` 的既有機制——**看需求內文的第一行**：

| 第一行 | 方向 | 必填區塊 |
| --- | --- | --- |
| `` `client:<event>` `` | 客戶端 → 伺服器 | **Payload**、**Ack**、**Failure Responses** |
| `` `server:<event>` `` | 伺服器 → 客戶端 | **Payload** |

**為什麼用 `client:` / `server:` 而非箭頭**：箭頭（`→`）在 regex 與不同編輯器的編碼處理上多一層風險，而這兩個字面值直接對應程式碼裡已經存在的 `CLIENT_EVENTS` / `SERVER_EVENTS`（`adapter/in/ws/events.ts`），spec 與實作用同一組詞彙。

**為什麼 `client:` 要寫 Ack**：沒有 ack 的事件也必須明示「本事件無 ack」，而不是省略。省略與「忘了寫」在文件上長得一模一樣——這正是 M2 要做的可靠投遞最需要講清楚的部分。

**為什麼 `server:` 不必寫 Failure**：伺服器推送沒有對應的失敗回應可回給誰。推送失敗屬於傳輸層問題，由 `platform-websocket-transport` 涵蓋。

### D5：`ws-*` 禁用 `**Success Response**`

既有的反向檢查是「`ui-*` 與 `platform-*` MUST NOT 寫 API 回應區塊」，用意是防止 endpoint 契約寫錯地方。`ws-` 加入後若不比照，會出現「WS 事件用 HTTP 的區塊名稱」的混合寫法，那條反向檢查的意義就被稀釋了。

`ws-*` 有自己的區塊名稱（Payload / Ack / Failure Responses），`Success Response` 一律視為誤用。

## Risks / Trade-offs

- **[多一個分類要維護]** 每個前綴都要有自己的格式規則、檢查、與 schema instruction → 這是分類化的固定成本；相對地，把不同形狀的契約塞進同一類的代價是「守則對其中一種靜默放行」，那更糟

- **[新規則沒有既有 spec 可驗證]** 目前沒有任何 `ws-*` 能力，新增的檢查會在「掃描有效性自我檢查」上遇到零樣本 → 檢查本身要能容忍「尚無 `ws-*` 能力」而不是硬性要求 `> 0`；但**必須有合成輸入的自我測試**釘住判定邏輯，否則規則出錯是靜默的（本專案已記載過這個型態）

- **[M2 才會真正用到]** 本 change 建立框架但沒有實際使用者，可能與 M2 的實際需求對不上 → 框架刻意只定「必填區塊」而不定內容；真的不合用時在 M2 調整的成本低於現在過度設計
