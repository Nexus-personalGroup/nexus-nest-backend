## Context

M1 建立了 `test/integration/`（11 條，真 Redis、兩個實例），但沒有把它接進 CI——當時的 tasks 沒列這一項，是範圍的疏漏而非決定。

盤點 CI 現況時發現一件會讓它悄悄壞掉的事：**整合測試的 Redis 連線目前是靠預設值碰巧對上的**。
`setup-env.integration.ts` 沒有設 `REDIS_HOST` / `REDIS_PORT`，本機靠 `.env` 提供 `127.0.0.1:6389`，
CI 沒有 `.env` 就落到 `envSchema` 的預設 `localhost:6379`——剛好會對上 service container。
能動，但不是設計出來的，而是兩個獨立決定湊巧一致。改一下預設值或 compose 的埠，它就會以
「CI 連不到 Redis」的形式爆掉，而原因看起來會毫不相干。

## Goals / Non-Goals

**Goals:**

- 跨實例廣播的保證有自動化把關，不再只靠人記得手動跑
- 整合測試的外部相依（Redis 連線）由設定明示，不依賴預設值巧合

**Non-Goals:**

- **不處理「CI 擋不住合併」**：branch protection 與 ruleset 在 Free 方案的私有 organization repo 上都回 403。那是方案層級的限制，不是這支 change 能解決的，已記在 `tasks/todo.md` 的「需決定」
- 不調整整合測試的內容或斷言
- 不把整合測試併進 e2e（理由見 D1）

## Decisions

### D1：獨立成 `integration` job，不併進 `e2e`

兩者的**前置條件相反**：e2e 把 Redis mock 掉（它驗的是單一實例內的 API 行為，真 Redis 只會增加不穩定來源）；整合測試必須用真 Redis（跨實例廣播完全建立在 pub/sub 之上）。

併在同一個 job 的話，e2e 會被迫在一個有 Redis service 卻用不到它的環境裡跑，而且兩套 jest 設定（`setup-env.e2e.ts` vs `setup-env.integration.ts`）要在同一個 process 內切換——mock 與真連線打架，正是分成兩套設定要避免的。

### D2：`integration` 不列入 `build` 的 `needs`

沿用 `e2e` 的取捨：它較慢，不該阻塞產出，但**失敗仍會使整個 workflow 失敗**。

`build` 只 `needs: [quality]`——品質未過就不浪費資源建置，而較慢的驗證平行跑。

### D3：`setup-env.integration.ts` 明確宣告 Redis 連線

改成從環境變數讀、並提供**與 CI service container 一致**的預設值，而不是沉默地落到 `envSchema` 的預設。

**不選「維持現狀」**：現在能動是因為 `envSchema` 的 `REDIS_PORT` 預設 6379 剛好等於 CI service container 的埠。這兩個值沒有任何關聯，改動其中一個就會壞，而症狀（「CI 連不到 Redis」）指不到原因。

**不選「在 CI 的 job env 設定」**：那樣本機與 CI 的來源不同（本機 `.env`、CI job env），設定檔本身仍然看不出這支測試需要 Redis。寫在 `setup-env.integration.ts` 才是「這支測試的前置條件」該待的地方。

### D4：埠沿用測試檔內的 34101 / 34102，不改成動態分配

GitHub 的 ubuntu runner 是乾淨的容器，這兩個高位埠沒有衝突風險。動態分配（listen 0 再讀實際埠）會讓測試多一層間接，而它解決的是本機開發者已經佔用該埠的情境——那個情境用改常數就能處理。

**但這是首跑才能確認的假設**，列入需觀察項。

## Risks / Trade-offs

- **[runner 上的多實例行為未經驗證]** 同一個 job 內起兩個 NestJS 實例 + 兩組 Redis 連線（每個實例的 adapter 各需 pub/sub 兩條），在 runner 的資源限制下是否穩定，只有實跑才知道 → 首次 run 必須人工觀察；若出現間歇性失敗，**保留完整 log 不要用 grep 過濾**（`tasks/lessons.md` 記過：前兩次 e2e 間歇失敗都因為管線過濾而查不下去）

- **[pipeline 變長]** 預估增加 1–2 分鐘 → 與 `quality` / `e2e` 平行執行，不串在後面；真的太慢再考慮限縮觸發條件

- **[Redis service 的就緒判定]** 沿用 `postgres` 的原則：用 healthcheck 而非固定等待。Redis 沒有 PostgreSQL 那種「初始化時先起臨時伺服器」的陷阱，`redis-cli ping` 即可，但仍要宣告 healthcheck 讓 job 等到它 healthy

## Migration Plan

無資料遷移。首次 PR 即會執行新 job。

**需使用者觀察**：首次 run 確認 (1) 兩個實例佔埠不衝突；(2) Redis service 連得上；(3) 整體時長可接受。
