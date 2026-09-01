## Context

兩件小事併成一支，因為它們都太小、單獨開一個 change 的文件會比改動本身還長。
共同點也夠實質：**兩者都是「做到一半、而且沒有東西會提醒」**——
Purpose 是 archive 留給人補的空格，權限名稱是改了群組標題之後沒跟上的項目名。

## Goals / Non-Goals

**Goals:**

- 5 份 master spec 的 Purpose 寫完，且**之後不可能再累積**（靠守則，不靠記得）。
- 權限的顯示名稱反映它實際涵蓋的範圍。

**Non-Goals:**

- **不重寫那 5 份的 Requirements**。它們是對的，缺的只有 Purpose。
- **不動權限碼、守衛、路由**。改的只有一個顯示字串。
- 不處理 `openspec archive` 本身（讓它自動產 Purpose 不在本專案能改的範圍內）。

## Decisions

### D1：用守則擋 `TBD`，而不是「記得補」

`openspec archive` 寫入 `TBD - created by archiving change X. Update Purpose after
archive.` 這串字，字面上已經在提醒人去補了——**而它被忽略了 5 次**。
提醒放在產出物裡而沒有東西會讀它，等於沒有提醒。

守則放進既有的 `openspec-spec-format.spec.ts`（它已經在檢查 master spec 的
命名與格式），不開新檔——「改 spec 格式要看哪支守則」多一個地方要記，
本身就是成本。

判定用「Purpose 區塊非空**且**不含 `TBD`」，而不是精確比對 archive 產生的那串字：

- 精確比對只擋得住原封不動的佔位字串。有人把它改成
  `TBD - 待補`（更短但一樣沒寫）就過關了，而那正是最可能發生的「補一半」。
- 代價是 Purpose 內文若真的要提到 `TBD` 三個字會誤報。
  可接受——Purpose 是在說「這個能力是什麼」，不該出現待辦標記。

**不選「讓 `openspec validate` 抓」**：那是 openspec CLI 的行為，不在本專案控制範圍。

### D2：`MODERATION:VIEW` 改名，`MODERATION:EDIT` 不改——不對稱是刻意的

改完之後同一組底下會是：

| 權限碼 | 顯示名稱 | 實際範圍 |
| --- | --- | --- |
| `BACKEND:MODERATION:VIEW` | 後台-**聊天管理**-檢視 | 營運總覽 + 檢舉審閱 + 聊天室 |
| `BACKEND:MODERATION:EDIT` | 後台-**檢舉審閱**-判定 | 只有檢舉的處置與判定 |

同一組內兩個名字不一樣，看起來像沒改乾淨。**但它是準確的**：
VIEW 真的涵蓋三個頁面，EDIT 真的只做檢舉判定。把 EDIT 一併改成
「聊天管理-編輯」會反過來**高估**它——讀的人會以為它能改聊天室或營運資料。

於是這個不對稱本身在傳遞資訊：**EDIT 比 VIEW 窄**。
這件事寫進 `ui-role-management` 的 spec，否則下一個人會把它當成漏改而「修正」回去
——那是本專案已經發生過的模式（`improve-admin-orientation` 就修掉一段
描述舊解法的註解，因為留著會讓人以為舊解法還必要）。

**不選「拆成三組權限碼」**：需要一個「只給看營運總覽、不給看檢舉」的真實場景，
而那個場景不存在（`improve-permission-tree-legibility` design D5 已判斷過一次）。
改名是成本最低而且解決同一個困惑的做法。

### D3：Purpose 寫「這份 spec 的特殊之處」，不寫需求摘要

5 份都照同一個結構：一段說它定義什麼，一段說**讀的人最需要先知道的那件事**。
摘要式的 Purpose（「本 capability 定義 A、B、C 三個需求」）沒有價值——
底下就寫著，重複一次只是讓人多讀一遍。

各自要先說的那件事：

| spec | Purpose 要先說的 |
| --- | --- |
| `api-dashboard` | 快照是**一次性**的，SSE 推的也是同一份快照而非增量 |
| `ui-dashboard` | 數字會過期，而**看不出過期的數字比沒有數字更糟** |
| `ui-member-profile` | 它**沒有列表可以進入**，只能從檢舉或聊天室帶著 ID 過來 |
| `ui-room-overview` | 刻意**不看訊息內容**——審閱動線的入口，不是訊息瀏覽器 |
| `ui-moderation` | 處置動作**無權限時 disabled 不隱藏**，與列內動作的規則相反 |

## Risks / Trade-offs

- **`TBD` 的字面比對會誤報**：Purpose 內文真的要寫 `TBD` 三個字時會被擋。
  接受（見 D1）。真的需要時就是該把它寫完。
- **改 `name` 要重跑 seed**，否則畫面是舊字串。與上一支 change 同一個坑，
  寫進 tasks 的驗收步驟。
- **D2 的不對稱仍可能被誤讀**。spec 寫了理由，但 spec 不是每個人都會讀。
  沒有守則能檢查「名稱是否反映範圍」——這是自律項，誠實標記。

## Open Questions

無。
