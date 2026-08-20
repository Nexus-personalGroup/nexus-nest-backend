# OpenSpec 慣例

> 自訂 schema、能力命名前綴、api-* 的請求／回應格式、change 命名、tasks.md 塊式切分。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## OpenSpec 慣例

### 自訂 schema：格式規範的載體

專案的 spec / tasks 格式規範不寫在文件裡等人自律，而是放在 fork 出來的 schema：

```
openspec/schemas/spec-driven-custom/
├── schema.yaml              # 各 artifact 的 instruction（openspec instructions 餵給 AI 的內容）
└── templates/               # 產出檔案的骨架
    ├── proposal.md  ├── spec.md  ├── design.md  └── tasks.md
```

**建立 change 一律要帶旗標**：

```bash
openspec new change "<name>" --schema spec-driven-custom
```

`openspec config` 只支援 global scope，專案預設 schema 進不了版控——少帶旗標就會靜默
落回內建 schema，本節所有規範一條都不會生效。`openspec-propose` skill 已內建此旗標，
`openspec-schema.spec.ts` 會在旗標消失或 change 用錯 schema 時失敗。

### 能力（capability）命名

能力名稱為 kebab-case，**必須**帶三類前綴之一。前綴決定該 spec 的寫法：

| 前綴 | 內容 | 要寫 Request/Response | 範例 |
| --- | --- | --- | --- |
| `api-` | 後端 endpoint 契約（預設後台） | ✅ 必寫 | `api-member-management` |
| `api-front-` | 前台 endpoint 契約 | ✅ 必寫 | `api-front-article` |
| `ui-` | 前端畫面行為、版面、權限顯示 | ❌ | `ui-member-management` |
| `platform-` | 跨切面契約與工程規則 | ❌ | `platform-api-error-response` |

- 同一功能的前後端**拆成兩支**（`api-xxx` 與 `ui-xxx`）：驗收方式不同，
  一個打 HTTP、一個驗元件行為。
- 前端目前只有一支 admin SPA，`ui-` 不標側。
- **不要為單一 endpoint 開新能力**，併進它所屬的既有 spec。

### `api-*` 的 endpoint 需求格式

每個宣告 endpoint 的 `### Requirement:`（內文以 `` `METHOD /path` `` 開頭者）
在敘述之後、scenario 之前，必須依序寫 **Request**、**Success Response**、
**Failure Responses** 三段，並附實際 JSON。

回應形狀一律用本專案的 wrapper（見「API 回應格式」），**不要照抄其他專案的**：

```json
{ "success": true, "data": { }, "timestamp": "..." }
```

兩個容易寫錯的地方：

- **回傳 `null` / `undefined` 時 `data` 這個 key 整個不存在**，不是 `"data": null`。
- **`204 No Content` 完全沒有 body**，不套 wrapper。本專案的 PATCH / DELETE 多為 204。

`openspec-spec-format.spec.ts` 會檢查命名前綴、標題行與目錄名一致、
`api-*` 的 endpoint 需求有無缺 Request/Response、以及 `ui-*` / `platform-*` 有沒有誤寫回應區塊。

### change 命名

`<動詞>-<目標>`，kebab-case。動詞用既有的這幾個，不要自創：
`add-`（新增能力）、`fix-`（修錯）、`refactor-`（不改行為的重整）、
`enforce-`（把既有規則變成會失敗的檢查）、`improve-`（既有能力的增強）。

封存後路徑為 `openspec/changes/archive/<YYYY-MM-DD>-<name>/`。

### tasks.md 的塊式切分

`##` 標題為一「塊」，切塊的唯一標準是**能不能獨立通過驗證鏈**，不是概念上像不像一組。
有鏈式依賴的必須綁進同一塊（砍欄位會同時打到 service 與 seed，拆開就留下編譯不過的中間狀態）。

檔頭以引言區塊寫出該 change 的實際驗證鏈指令、「每塊綠燈後給 commit 指令由使用者執行」、
以及塊與塊的依賴關係。每個寫測試的塊結尾放**反向驗證**：刻意改壞 production code，
確認測試真的變紅再改回來——改不紅的是假測試。

---

## 寫作品質基準

格式規則（上方）決定「合不合法」，本節決定「有沒有用」。以下每一條都來自實際踩過或
實際擋下問題的經驗，不是理想化的建議。

### 動手寫之前先讀既有程式碼

寫 `design.md` 的 Context 之前先探索：這件事會碰到哪些既有實作、它們現在怎麼做、
有沒有相關的守則。**探索時發現的東西就是 Context 該寫的內容**。

實例：M1 開工前讀 `JwtAuthGuard`，發現它有六段實質邏輯，於是 design 的 D2 才會是
「抽成共用 service」而不是「為 WS 寫一份認證」。同一次探索也發現三條守則的掃描範圍
寫死在 HTTP 那側——那變成本 change 的一半工作量。**沒有那次探索，這些都會在
實作到一半才浮現，而那時範圍已經定了。**

### 每個決定都要寫「不選 X 的理由」

`## Decisions` 的每一項都要有被否決的選項與否決的理由。**只寫結論等於把判斷過程丟掉**
——下次有人想改回 X 時，無從得知當初為什麼不選。

寫法：先講選了什麼，再講「**不選 Y**：〈具體代價〉」。代價要具體到可以反駁，
「比較複雜」不算理由，「M1+M2 的工作量至少翻倍，且自己實作重連與 ack 的錯誤率
遠高於用成熟實作」才算。

### 驗收條件要可證偽

「跨實例廣播可用」不是驗收條件，**「起兩個 API 實例，A 實例送出的訊息 B 實例的連線
收得到」才是**——後者可以寫成一條會失敗的測試，前者只能靠感覺。

每支 change 的 proposal 都該有一句話說清楚「怎樣算做完」，而那句話要能直接翻譯成測試。

### 範圍變化要留在文件裡，不要重寫歷史

實作途中追加的工作用 `2b` 這種編號插在相關塊之後，並在塊標題下用一段話交代
**它為什麼被併進來**（在哪一塊收尾時發現、經誰確認）。

取消的項目用刪除線 + 粗體結論 + 理由，不要直接刪掉：

```markdown
- [x] 4.6 ~~`.gitlab-ci.yml` 的 MySQL service container~~ —— **刻意不改**：
      下一支 change 會整檔汰換，改了是丟棄工作
```

**任務清單與事實不符是最常見的失真來源。** 收尾時逐項核對，不要憑印象打勾——
本專案曾有兩條早已完成的待辦掛了近一個月，也曾有「本機通過」的勾其實是假的
（CI 會在覆蓋率門檻擋下）。

### 反向驗證不是選配

每個寫測試的塊都要有：**刻意改壞 production code → 親眼看它變紅 → 還原 →
確認 `git status` 乾淨**。改不紅的是假測試。

還原步驟本身也要驗證（`cp` 常被 alias 成 `cp -i`，非互動時會靜默不覆寫）。

**新守則沒有真實樣本時，反向驗證是唯一的正確性依據**——`ws-*` 的事件格式檢查
在第一支 `ws-` spec 出現之前掃不到任何東西，只能靠合成輸入測試加上臨時造一個
違規 spec 來證明它不空轉。

### 不確定就留成 Open Questions，不要硬決定

`design.md` 的 `## Open Questions` 是給「知道有這個問題、但現在決定會是瞎猜」的事。
硬做決定的代價是它會被當成已定案而擴散。

實例：M1 沒有決定 M2 的事件契約前綴，因為那要看 M2 的實際契約長什麼樣。
留成 Open Question 並轉列 `tasks/todo.md` 的「需決定」，M2 開工前才處理——
屆時有具體需求可以判斷，比預先設計準確。

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
