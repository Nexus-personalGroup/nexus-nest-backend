## ADDED Requirements

### Requirement: 提出檢舉

`POST /api/front/chat-reports` SHALL 讓房間成員檢舉該房間中的一則訊息。

檢舉人 MUST 是該訊息所屬房間的成員——不能檢舉自己看不到的訊息。
沒有這條限制的話，任意已登入者可以拿 `messageId` 猜測並檢舉，
那既是騷擾管道，也會讓佇列被無意義的檢舉淹沒。

MUST NOT 允許檢舉自己發送的訊息：那不是檢舉，而且會是繞過撤回時限的側門。

**同一人對同一則訊息只能檢舉一次**：重複送出 MUST 回傳既有那筆而非建立第二筆，
且 MUST 回 `200` 而非錯誤——重複檢舉不是失敗，使用者的意圖已經達成了。
唯一性 MUST 由資料庫的唯一約束提供，MUST NOT 僅以「先查有沒有」實作。

不同人檢舉同一則訊息 MUST 各自產生一筆——「幾個人檢舉」本身是優先序訊號。

檢舉 MUST 快照被檢舉訊息的當下內容。訊息可能在審閱前被撤回或清理，
沒有快照的話管理員會看到一則空訊息，而檢舉人明明看到了東西。
該快照 MUST NOT 由任何前台端點回傳。

**被檢舉者 MUST NOT 得知自己被檢舉**：本 change 不提供任何會洩漏此事的端點或推播。

**Request**（body）：

```json
{
  "messageId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "reason": "HARASSMENT",
  "description": "持續辱罵"
}
```

`reason` 為 `HARASSMENT` / `SPAM` / `INAPPROPRIATE` / `OTHER`；
`description` 可選，上限 500 字。

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "reportId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "PENDING",
    "createdAt": "2026-08-21T06:00:00.000Z"
  },
  "timestamp": "2026-08-21T06:00:00.000Z"
}
```

回應 MUST NOT 包含被檢舉者的任何資訊——檢舉人已經知道那是誰，
回傳它只會多一條可被用來確認身分的路徑。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `404`、`code: "CHAT_MESSAGE_NOT_FOUND"`：訊息不存在，**或檢舉人不是該房間成員**
- `400`、`code: "CHAT_REPORT_SELF"`：檢舉自己發送的訊息
- `400`、`code: "BAD_REQUEST"`：`reason` 不在允許的分類中，或 `description` 超長

#### Scenario: 成員檢舉他人的訊息

- **WHEN** 房間成員對同房間中他人的訊息提出檢舉
- **THEN** 回 `200`，建立一筆 `PENDING` 的檢舉並快照訊息內容

#### Scenario: 重複檢舉同一則

- **WHEN** 同一人對同一則訊息再次提出檢舉
- **THEN** 回 `200` 與**原本那筆**的 `reportId`，MUST NOT 建立第二筆

#### Scenario: 不同人檢舉同一則

- **WHEN** 另一名成員檢舉同一則訊息
- **THEN** 各自產生一筆——檢舉筆數是優先序訊號

#### Scenario: 非成員檢舉

- **WHEN** 檢舉人不是該訊息所屬房間的成員
- **THEN** 回 `404`、`CHAT_MESSAGE_NOT_FOUND`——與「訊息不存在」同一個回應，
  否則可用它探測任意訊息是否存在

#### Scenario: 檢舉自己的訊息

- **WHEN** `messageId` 指向檢舉人自己發送的訊息
- **THEN** 回 `400`、`CHAT_REPORT_SELF`

#### Scenario: 被檢舉的訊息已撤回

- **WHEN** 檢舉的目標是一則已撤回的訊息
- **THEN** 照常受理——撤回不該讓行為變得無法檢舉，快照取自資料庫中保留的內容
