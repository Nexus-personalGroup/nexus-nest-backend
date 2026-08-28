## MODIFIED Requirements

### Requirement: 更新角色

`PATCH /api/admin/roles/:id` SHALL 更新角色的 `name`、`permissionCodes` 或 `status`，
三者均為選填：**省略表示不變更**，`permissionCodes` 傳空陣列 `[]` 表示清空所有權限。
MUST 要求 `BACKEND:ROLE:EDIT`。預設角色（`isDefault === true`）MUST 拒絕編輯。

多欄位同送時 MUST 在**同一個資料庫 transaction** 內完成，
不得留下「name 已改但 status 未改」的中間狀態。

**更新成功後 MUST 清除該角色所有成員的 `MemberContext` 快取。**
那份快取帶著 `roleName`、`permissions` 與帳號狀態，TTL 最長 `PERMISSION_CACHE_TTL`
（預設 300 秒）。不清的話，**權限的變更最多五分鐘之後才會生效**——
而兩個方向的後果不對稱：加權限只是讓人多等，**拿掉權限則是他繼續用得到五分鐘**，
而會急著拿掉某人權限的場合正是最不能等的那種。

清除 MUST 涵蓋三種變更（名稱、權限、狀態），**MUST NOT 判斷「這次改的是不是授權」**。
要判斷就得比對前後的權限集合，而那個比對寫錯的方向是**該清沒清**——
一個沒有徵兆的失效。省下的只是一次罕見操作的批次刪除。

清除失敗 MUST 讓整個更新失敗，MUST NOT 吞掉。失敗的語意是
「權限改了但沒有生效」，吞掉的話呼叫者看到「更新成功」而系統處於一個
他不知道的狀態——那正是撤銷權限最不能接受的結果。
（對比：稽核寫入失敗是 best-effort，因為它不影響任何人的實際權限。）

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path `id: string (uuid)`；body 全部選填）：

```json
{
  "name": "審核人員",
  "permissionCodes": ["BACKEND:ACCOUNT:VIEW"],
  "status": false
}
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`name` 長度不合法，或 `status` 非 boolean
- `400`、`code: "DEFAULT_ROLE_NOT_EDITABLE"`：目標為預設角色
- `400`、`code: "INVALID_PERMISSION_CODE"`：含不存在的權限碼
- `400`、`code: "INVALID_PERMISSION_COMBINATION"`：有 EDIT 但缺同模組的 VIEW
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:EDIT`
- `409`、`code: "DUPLICATE_ROLE_NAME"`：新名稱已被其他角色使用
- `500`：快取清除失敗（權限已寫入資料庫但未生效，呼叫者應重試）

#### Scenario: ⭐ 撤銷權限後既有 session 立即失效

- **WHEN** 某成員持有效 token 且該權限已在快取中，管理員把該權限從他的角色移除
- **THEN** 該成員的**下一個請求** MUST 回 `403`，MUST NOT 等到快取過期

#### Scenario: ⭐ 授予權限後既有 session 立即可用

- **WHEN** 管理員為某角色加上一個權限
- **THEN** 該角色成員的下一個請求 MUST 已具備該權限，不必重新登入

#### Scenario: 停用角色

- **WHEN** 管理員把某角色 `status` 改為 false
- **THEN** 該角色成員的快取 MUST 一併清除

#### Scenario: 只改名稱也要清

- **WHEN** body 只有 `{ "name": "新名稱" }`
- **THEN** 快取 MUST 仍然被清除——`MemberContext` 帶著 `roleName`，
  不清的話顯示的是舊名字

#### Scenario: 不影響其他角色的成員

- **WHEN** 更新角色 A
- **THEN** MUST NOT 清除角色 B 成員的快取

#### Scenario: 快取清除失敗

- **WHEN** Redis 不可用
- **THEN** 整個更新 MUST 失敗並回 5xx，MUST NOT 回 `204`

#### Scenario: 僅切換 status

- **WHEN** 對非預設角色 PATCH `{ "status": false }`
- **THEN** 回 `204`，該角色 `status` 變 `false`，`name` 與權限保持不變

#### Scenario: name 與 status 同送具原子性

- **WHEN** body 為 `{ "name": "審核人員", "status": true }`
- **THEN** 回 `204`，`name` 與 `status` 於同一 transaction 內同時生效，權限不變

#### Scenario: 清空權限

- **WHEN** body 為 `{ "permissionCodes": [] }`
- **THEN** 回 `204`，該角色所有權限被清空

#### Scenario: 省略欄位不變更

- **WHEN** body 為 `{ "name": "新名稱" }`
- **THEN** 回 `204`，`permissionCodes` 與 `status` MUST 維持原值

#### Scenario: 預設角色不可編輯

- **WHEN** 目標角色 `isDefault === true`
- **THEN** 回 `400`、`code: "DEFAULT_ROLE_NOT_EDITABLE"`，DB 不變

#### Scenario: status 型別錯誤

- **WHEN** body 為 `{ "status": "off" }`
- **THEN** 回 `400`（zod 拒絕非 boolean）

#### Scenario: 名稱與他人重複

- **WHEN** 新 `name` 已被其他未軟刪除的角色使用
- **THEN** 回 `409`、`code: "DUPLICATE_ROLE_NAME"`，不更新
