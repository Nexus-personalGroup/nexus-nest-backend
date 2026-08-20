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
