## ADDED Requirements

### Requirement: CSP 預設全站啟用，只有 API 文件路徑豁免

服務 SHALL 對所有回應套用 Content-Security-Policy，**MUST NOT 全域關閉**。
只有 API 文件路徑（`/api/admin/docs*`、`/api/front/docs*`）MAY 放寬，
因為 Swagger UI 依賴 inline script/style。

**豁免 MUST 以路徑為界，MUST NOT 以「本服務是純 API」為理由整組關閉。**
那個理由**曾經**成立，但同一份 `app.module.ts` 有 `ServeStaticModule` +
`WEB_STATIC_ROOT` 的單一埠部署模式——在那個模式下後台 SPA 由同一個 Express
服務，於是整個後台介面也沒有 CSP。**前提在部署形態改變時失效了**，
而失效的方式不會有任何錯誤訊息。

這條需求的重點不是「CSP 是好東西」，是**豁免的範圍必須跟著理由走**：
理由只涵蓋文件路徑，豁免就只能是文件路徑。

放寬與否 MUST 由路徑決定，MUST NOT 由 `NODE_ENV` 決定——
開發與正式環境跑的若是不同的 CSP，正式環境才會發現的違規就不會在開發時出現。

#### Scenario: 一般 API 回應

- **WHEN** 請求任一非文件路徑（如 `/api/admin/members`）
- **THEN** 回應 MUST 帶 `Content-Security-Policy` header

#### Scenario: 單一埠部署下的後台 SPA

- **WHEN** 設定 `WEB_STATIC_ROOT`，由同一個服務吐出後台 SPA 的 HTML
- **THEN** 該回應 MUST 帶 CSP——這正是全域關閉時被漏掉的那一塊

#### Scenario: Swagger UI

- **WHEN** 請求 `/api/admin/docs` 或 `/api/front/docs`
- **THEN** CSP MAY 放寬至足以讓 Swagger UI 的 inline script/style 執行，
  且該頁面 MUST 仍可正常運作

#### Scenario: 有人重新全域關閉 CSP

- **WHEN** 實作改回 `helmet({ contentSecurityPolicy: false })`
- **THEN** 違反本需求
