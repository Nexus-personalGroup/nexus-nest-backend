# OpenSpec 慣例

> 自訂 schema 的機制、change 命名，以及 schema 放不下的本專案實例。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## 格式規則的正本在 schema，不在這裡

專案的 proposal / spec / design / tasks 格式規範**一律住在**：

```
openspec/schemas/spec-driven-custom/
├── schema.yaml              # 各 artifact 的 instruction（openspec instructions 餵給 AI 的內容）
└── templates/               # 產出檔案的骨架
    ├── proposal.md  ├── spec.md  ├── design.md  └── tasks.md
```

**本檔不重述那些規則。** 能力命名前綴、`api-*` 的請求／回應四段式、delta 操作、
塊式切分、design 的三條寫作要求、驗收條件可證偽、反向驗證、範圍變化的記法——
全部去讀 `schema.yaml`，或直接跑：

```bash
openspec instructions <artifact-id> --change "<name>" --json
```

**為什麼不在這裡也寫一份**：同一條規則放兩個地方，改一處另一處就變成假的。
實例——本檔曾寫「能力名稱必須帶**三類**前綴」而表格列了四個，且完全漏掉 `ws-`，
但當時 `openspec/specs/` 底下已經有 **5 支 `ws-*`**。照本檔走的人不會知道它存在。
`schema.yaml` 是被 `openspec instructions` 在產出當下餵給 AI 的那一份，
而且有 `openspec-schema.spec.ts` 釘住，所以它是正本。

**流程與行為規則**（commit 粒度、分支命名、change 生命週期、openspec 與 superpowers
的分工、bug 要不要開 change、memory 規則）的正本在 `CLAUDE.md`，那份每個 session
都會載入。schema 與本檔都不重述它們。

### 建立 change 一律要帶旗標

```bash
openspec new change "<name>" --schema spec-driven-custom
```

兩道保險並存且**都要留**：`openspec/config.yaml` 釘住專案預設（涵蓋「沒有東西在掃」
的情況，例如有人在終端機手打 `openspec new change`），旗標則是
`openspec-schema.spec.ts` 唯一看得到、擋得下的東西。config 檔被刪或值改錯是**靜默**
失效，旗標漏帶是**顯性**失敗。`openspec-propose` skill 已內建此旗標。

### change 命名

`<動詞>-<目標>`，kebab-case。動詞用既有的這幾個，不要自創：
`add-`（新增能力）、`fix-`（修錯）、`refactor-`（不改行為的重整）、
`enforce-`（把既有規則變成會失敗的檢查）、`improve-`（既有能力的增強）。

封存後路徑為 `openspec/changes/archive/<YYYY-MM-DD>-<name>/`。

（分支怎麼命名是**另一件事**，見 `CLAUDE.md` 的 Change lifecycle——
分支是交付單位，不跟 change 名綁定。）

---

## 本專案的實例

schema 給的是規則，這裡補規則背後的**本專案實例**。規則本身不在這裡重複。

### 「動手寫之前先讀既有程式碼」的實例

M1 開工前讀 `JwtAuthGuard`，發現它有六段實質邏輯，於是 design 的 D2 才會是
「抽成共用 service」而不是「為 WS 寫一份認證」。同一次探索也發現三條守則的掃描範圍
寫死在 HTTP 那側——那變成本 change 的一半工作量。**沒有那次探索，這些都會在
實作到一半才浮現，而那時範圍已經定了。**

### 「不選 X 的理由」要具體到可以反駁

「比較複雜」不算理由。「M1+M2 的工作量至少翻倍，且自己實作重連與 ack 的錯誤率
遠高於用成熟實作」才算。

### 「驗收條件可證偽」的實例

「跨實例廣播可用」不是驗收條件，**「起兩個 API 實例，A 實例送出的訊息 B 實例的連線
收得到」才是**——後者可以寫成一條會失敗的測試，前者只能靠感覺。

### 「留成 Open Questions」的實例

M1 沒有決定 M2 的事件契約前綴，因為那要看 M2 的實際契約長什麼樣。
留成 Open Question 並轉列 `tasks/todo.md` 的「需決定」，M2 開工前才處理——
屆時有具體需求可以判斷，比預先設計準確。

### 反向驗證在「沒有真實樣本」時的角色

`ws-*` 的事件格式檢查寫在第一支 `ws-` spec 出現之前，掃不到任何東西，
只能靠合成輸入測試加上臨時造一個違規 spec 來證明它不空轉。
**新守則沒有真實樣本時，反向驗證是唯一的正確性依據。**

---

## 寫作品質基準（schema 沒涵蓋的部分）

### 文件同步是鏈式依賴，不是收尾

`compose.yml` 的對外埠必須寫進 README——這條守則會讓「改了埠但沒改文件」的塊直接紅，
因此 README 必須綁進**同一塊**而不是排到最後的文件塊。

判準：**如果有守則會因為文件沒同步而失敗，那份文件就是該塊的一部分。**

### 寫「什麼東西的缺席才是問題」

新增守則時除了問「這條規則怎麼寫」，多問一句：**什麼東西不存在才是缺陷？**

既有守則多半驗證「有標註的標對了」，而最嚴重的問題往往出在「該標的沒標」——
本專案的附件 IDOR 通過了當時全部 18 支守則，因為每一條它都遵守，
只是少了沒有規則要求它有的東西。

### 誠實勝過好看

- 做不到的事寫「做不到」與原因，不要寫成待辦（branch protection 在 Free 方案的
  私有 repo 上回 403，那不是忘記設定）
- 驗收沒過就說沒過，附上實際輸出，不要只寫「通過」
- 自己訂的判準後來發現不成立，就更正判準並說明為什麼（M1 的「既有測試零修改」
  對單元測試不成立，因為建構子變了；正確的判準是 **e2e 零修改**）
