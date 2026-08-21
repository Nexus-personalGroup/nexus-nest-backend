## ADDED Requirements

### Requirement: 移除違規訊息

`DELETE /api/admin/moderation/messages/:messageId` SHALL 由管理員移除違規訊息，
需 `BACKEND:MODERATION:EDIT` 權限。

移除採**軟刪除**：該列與其 `seq` MUST 保留，內容 MUST 保留於資料庫。
移除的訊息正是最需要留下證據的那些——檢舉調查、申訴、日後的爭議都要看得到原文。

移除 MUST 使用與使用者撤回**不同的標記**（`removedAt`），MUST NOT 共用 `retractedAt`。
兩者對客戶端的語意不同（「對方自己收回」vs「被平台處理」），
共用會讓發送者以為自己撤回了，也讓後台無法統計「被移除幾則」。

**移除 MUST NOT 要求該訊息被檢舉過**：管理員可能從私訊、主動巡邏等管道發現違規內容。
移除的授權來自 RBAC，不來自檢舉的存在。

**冪等**：重複移除同一則回 `204`，不重複推播。

**Request**（path）：`messageId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "CHAT_MESSAGE_NOT_FOUND"`：訊息不存在

#### Scenario: 移除訊息

- **WHEN** 有權限的管理員移除某則訊息
- **THEN** 回 `204`，該則標記為已移除，房間成員收到 `server:messageRemoved`

#### Scenario: 已被使用者撤回的訊息

- **WHEN** 該則已被發送者撤回
- **THEN** 仍可移除；兩個標記同時存在，呈現上以移除優先

#### Scenario: 只有 VIEW 權限

- **WHEN** 呼叫者有 `BACKEND:MODERATION:VIEW` 但沒有 `EDIT`
- **THEN** 回 `403`

#### Scenario: 重複移除

- **WHEN** 對已移除的訊息再次執行移除
- **THEN** 回 `204`，MUST NOT 重複推播、MUST NOT 覆寫原本的移除時間

### Requirement: 還原被誤移除的訊息

`POST /api/admin/moderation/messages/:messageId/restore` SHALL 清除移除標記，
需 `BACKEND:MODERATION:EDIT` 權限。

誤判在審閱情境是真實的。沒有回頭路會讓管理員傾向不敢處理——
**一個不敢用的工具等於沒有工具**。

還原 MUST NOT 影響使用者自己的撤回狀態：若該則原本已被發送者撤回，
還原後 MUST 回到「已收回」而非完全正常。

還原 MUST 留下稽核紀錄。`removedAt` 清除後，「這則曾經被移除過」就不再留在訊息列上，
而**反覆移除再還原本身就是可疑行為**——只有兩邊都記才看得出那個模式。

**Request**（path）：`messageId`

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶或帶了無效的 Bearer Token
- `403`、`code: "FORBIDDEN"`：缺少 `BACKEND:MODERATION:EDIT` 權限
- `404`、`code: "CHAT_MESSAGE_NOT_FOUND"`：訊息不存在

#### Scenario: 還原被移除的訊息

- **WHEN** 有權限的管理員還原一則被移除的訊息
- **THEN** 回 `204`，移除標記被清除，房間成員收到 `server:messageRestored`

#### Scenario: 還原曾被撤回的訊息

- **WHEN** 該則原本已被發送者撤回，之後被移除
- **THEN** 還原後 `retractedAt` 仍保留——它回到「已收回」而非完全正常

#### Scenario: 還原未被移除的訊息

- **WHEN** 該則沒有被移除過
- **THEN** 回 `204`（冪等），MUST NOT 推播

#### Scenario: 還原留下稽核

- **WHEN** 還原成功
- **THEN** 留下稽核紀錄——否則「曾被移除」這件事在還原後就沒有任何痕跡
