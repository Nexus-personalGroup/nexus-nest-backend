<!--
  能力（capability）名稱決定這份 spec 要不要寫 Request / Response 區塊：

    api-*       後端 endpoint 契約 → 四段式（Request / Success / Failure / Scenario）必寫
    ui-*        前端畫面行為       → 不寫 JSON，改述版面、互動、依權限的顯示差異
    platform-*  跨切面工程規則     → 不寫 JSON，改述約束與其強制手段

  下方骨架以 api-* 為例。ui-* / platform-* 請刪掉 Request / Success / Failure 三段，
  只留「### Requirement:」＋敘述＋「#### Scenario:」。
-->

## ADDED Requirements

### Requirement: <!-- 需求名稱，中文動詞短語，如「作者列表查詢」 -->

<!--
  一段話交代完：系統 SHALL 提供哪個 method + path、要哪個權限碼、
  有哪些查詢/篩選行為、回應走統一 wrapper。
  用 SHALL / MUST / MUST NOT，不要用 should / may。
-->

**Request**（<!-- query | body | path -->）：

```json
{}
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺 `<!-- 權限碼 -->`
- <!-- 其餘業務錯誤：`409`、`code: "XXX_HAS_YYY"`：觸發條件 -->

#### Scenario: <!-- 情境名稱 -->

- **WHEN** <!-- 條件 -->
- **THEN** <!-- 預期結果，含 HTTP status 與 code -->

#### Scenario: <!-- 失敗情境也要有 -->

- **WHEN** <!-- 條件 -->
- **THEN** <!-- 預期結果 -->
