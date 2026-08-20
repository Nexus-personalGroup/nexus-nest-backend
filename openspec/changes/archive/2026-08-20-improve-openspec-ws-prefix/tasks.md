> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`（本 change 只動守則與文件，不需 e2e / integration）。
> 一個 change 一個 commit，塊間不分開提交。
>
> **塊的依賴**：塊 1 是守則本體，塊 2 的 schema instruction 與塊 3 的文件都在描述它，
> 必須先定案。塊 1 內部的順序刻意是「先寫自我測試、再寫規則」——這條規則
> **沒有任何既有 spec 可以驗證**（目前零個 `ws-*` 能力），合成輸入是唯一的正確性依據。

## 1. 守則本體

- [x] 1.1 `openspec-spec-format.spec.ts` 的 `PREFIXES` 加入 `ws-`，並同步失敗訊息中「三類前綴」的說明文字
- [x] 1.2 新增 `declaredWsEvent(text)`：以需求內文**第一行**是否為 `` `client:<event>` `` 或 `` `server:<event>` `` 判定，回傳方向與事件名。沿用 `declaredEndpoint` 的既有機制（看第一行而非全文），理由相同——內文提到某事件不代表它是該事件的契約
- [x] 1.3 新增檢查：`ws-*` 中 `client:` 的需求必須有 **Payload** / **Ack** / **Failure Responses**；`server:` 的需求必須有 **Payload**
- [x] 1.4 擴充既有的「非 api- 不得寫 API 回應區塊」檢查，把 `ws-` 納入禁用 `**Success Response**` 的範圍
- [x] 1.5 **掃描有效性的處理**：目前零個 `ws-*` 能力，不可比照其他規則硬性要求 `checked > 0`（那會讓這條規則在被使用前一直是紅的）。改為「有 `ws-*` 時才要求掃到需求」
- [x] 1.6 **合成輸入的自我測試**（本塊最重要的一項）：至少釘住 (a) `client:` 缺 Ack → 抓出；(b) `client:` 三段齊全 → 通過；(c) `server:` 只需 Payload → 通過；(d) 內文提到 `client:xxx` 但不在第一行 → **不**視為事件需求；(e) `ws-*` 出現 `Success Response` → 抓出。**規則出錯是靜默的，而這條規則在 M2 之前沒有任何真實樣本**
- [x] 1.7 驗證：`pnpm --filter @app/api test:arch` 全綠，貼出護欄項數變化

## 2. schema instruction 同步

- [x] 2.1 `openspec/schemas/spec-driven-custom/schema.yaml` 的 specs instruction：前綴表加入 `ws-`，並寫出兩個方向的必填區塊與範例
- [x] 2.2 說明 `ws-` 不分前後台側的理由（WS 只服務終端使用者，後台走 SSE）——**不寫理由的話下一個人會比照 `api-front-` 加一個 `ws-front-`**
- [x] 2.3 驗證：`openspec-schema.spec.ts` 仍綠（它檢查 schema 的執行路徑，不檢查內容，但改壞 YAML 會被 parse 錯誤攔下）

## 3. 文件同步

- [x] 3.1 `openspec/project/openspec-conventions.md` 的前綴表加入 `ws-` 列，並補上事件契約的格式段落（比照既有的「`api-*` 的 endpoint 需求格式」）
- [x] 3.2 `tasks/todo.md`：移除「需決定（M2 開工前）」整節——決定已做出
- [x] 3.3 驗證：`pnpm test` 全綠（`project-docs.spec.ts` 檢查文件連結、繁中掃描等）

## 4. 收尾

- [x] 4.1 跑完整驗證鏈並貼出實際輸出
- [x] 4.2 **反向驗證**：臨時建立一個 `openspec/specs/ws-probe/spec.md`，寫一個缺 Ack 的 `client:` 需求，確認守則真的變紅；刪除後確認 `git status` 乾淨。**這是唯一能證明新規則不是空轉的方式**——它沒有真實樣本可依靠
- [x] 4.3 新踩到的坑寫進 `tasks/lessons.md`
- [x] 4.4 `openspec archive improve-openspec-ws-prefix` 封存
