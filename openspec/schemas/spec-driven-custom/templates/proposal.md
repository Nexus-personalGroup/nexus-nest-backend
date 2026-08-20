<!--
  `##` 標題保持英文——openspec CLI 會解析它們，`## Capabilities` 更是 proposal 與 specs
  兩個階段之間的契約。翻譯會靜默壞掉。標題以下一律繁體中文。

  這份只寫「為什麼」，不寫「怎麼做」——實作方式屬於 design.md。控制在 1-2 頁。
-->

## Why

<!-- 1-2 句講清楚問題或機會。解決什麼問題？為什麼是現在？ -->

## What Changes

<!-- 條列會改什麼。明確寫出新增的能力、修改與移除。破壞性變更標 **BREAKING** -->

## Capabilities

### New Capabilities

<!-- 新增的能力，各自產生 specs/<name>/spec.md。
     名稱為 kebab-case 且必須帶前綴，前綴決定 spec 的寫法：
       api-*       後端 endpoint 契約（後台）  例：api-member-management
       api-front-* 前台 endpoint 契約          例：api-front-article
       ui-*        前端畫面行為                例：ui-member-management
       platform-*  跨切面契約與工程規則        例：platform-api-error-response
     同一功能的前後端拆成兩支（api-xxx 與 ui-xxx），驗收方式不同。
     不要為單一 endpoint 開新能力——併進它所屬的既有 spec。
     沒有新增能力就整節刪掉。 -->

- `<name>`：<這個能力涵蓋什麼>

### Modified Capabilities

<!-- 既有能力中**需求**有變的才列，純實作調整不算。各需一份 delta spec。
     名稱用 openspec/specs/ 現有的資料夾名。沒有就整節刪掉。 -->

- `<既有名稱>`：<哪一條需求要改，改成什麼>

## Impact

<!-- 受影響的程式碼、API、相依套件。需要跑 migration 或改 .env 的要在此標出 -->
