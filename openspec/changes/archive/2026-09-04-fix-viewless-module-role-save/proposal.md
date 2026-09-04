## Why

**勾了「附件 - 編輯」就存不了角色。** 畫面回：

```
Permission code 不存在：BACKEND:ATTACHMENT:VIEW
```

`BACKEND:ATTACHMENT:VIEW` 從來就不存在。後端目錄裡附件只有 `EDIT`，
而且註解寫明理由：「上傳與刪除共用一個碼：兩者都是寫入操作，
**附件沒有『只能看』的場景**」。那個碼是前端**合成**出來的。

合成的地方是 `normalizePermissionCodes`，它做**純字串推導**：

```ts
const match = code.match(/^([A-Z_]+):([A-Z_]+):EDIT$/);
if (match) set.add(`${match[1]}:${match[2]}:VIEW`);
```

註解自己寫著「**純字串推導…不需 permission 清單**」——那句話就是 bug 本身：
它假設每個有 EDIT 的 module 都有 VIEW。

### ⚠️ 修完前端才發現：**後端有一模一樣的缺陷，而且它才是致命的那個**

前端不再合成之後，畫面改成回：

```
設定 BACKEND:ATTACHMENT:EDIT 時必須同時設定 BACKEND:ATTACHMENT:VIEW
```

後端 `validatePermissions` 也用純字串推導，**要求一個自己目錄裡不存在的碼**：

```ts
const viewCode = `${parts[0]}:${parts[1]}:VIEW`;
if (!codeSet.has(viewCode)) throw new InvalidPermissionCombinationException(...)
```

它上一行才剛用 `findByCodes` 查過 DB——**手上就有目錄卻沒用**。

**結果是 `BACKEND:ATTACHMENT:EDIT` 永遠不可能被指派給任何角色**：
權限存在於目錄、UI 畫得出來、但存不進去。

**前端那層修好仍然不夠**，因為擋下來的是後端。

**UI 那兩層都是對的**，只有送出前這道走了捷徑：

| 層 | 附件（只有 EDIT）時 |
| --- | --- |
| `PermissionsField.toggleEdit`（`if (group.view)`） | ✅ 沒有 VIEW 就不加 |
| `isViewLockedByEdit`（`if (!group.view \|\| !group.edit) return false`） | ✅ 不套用鎖定 |
| `normalizePermissionCodes`（純字串） | ❌ **合成不存在的碼** |

### 根因不是「實作違反需求」，是**需求自己有兩條互相矛盾的 bullet**

`ui-role-management` 的「權限蘊含關係」同時寫著：

> - 提交…MUST 透過 `normalizePermissionCodes` helper **統一補入缺失的 VIEW**
> - 若某 module 後端僅提供 VIEW 或僅提供 EDIT 其中一個，**本規則不套用**

module 只有 EDIT 時這兩條直接打架，而實作照著前者做了。
這正是 `tasks/todo.md`「已知缺口」記過的形狀：**需求內部矛盾沒有東西看得出來**。

**躲了這麼久是因為沒有人碰附件**——`permission-labels.ts` 自己寫著
「目前沒有任何後台頁面在用 `BACKEND:ATTACHMENT:EDIT`」，
而 `normalizePermissionCodes` **一個單元測試都沒有**。

## What Changes

- **後端修正**（致命的那個）：`validatePermissions` 只在該 module **確實提供**
  VIEW 時才要求它。它已經有 repo，多查一次目錄即可。
- **後端需求修正**：`api-role-management`「建立角色」的
  「EDIT 類權限 MUST 搭配同模組的 VIEW」補上前提。
- **前端需求修正**：把「統一補入缺失的 VIEW」加上前提——**只在該 module 同時有
  VIEW 與 EDIT 時**才補。兩條 bullet 不再打架。
- **實作修正**：`normalizePermissionCodes` 改成**知道哪些碼存在**，
  不再憑字串推導（做法見 design D1）。
- **補測試**：該函式目前零覆蓋。至少涵蓋「module 同時有兩者 → 補」與
  「module 只有 EDIT → 不補」。

## Capabilities

### Modified Capabilities

- `api-role-management`：「建立角色」的 EDIT/VIEW 搭配規則補上
  「該模組也提供 VIEW」的前提。
- `ui-role-management`：「權限蘊含關係 — EDIT 隱含 VIEW」的提交規則補上前提，
  並新增「module 只有 EDIT」的 scenario。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| API 契約 / Swagger | 無 |
| 後端 | **要修**——`validatePermissions` 有同一個缺陷（見下） |
| 前端 | 修 `normalizePermissionCodes`；呼叫端要傳入可用的權限清單 |

**這是使用者回報的 bug，不是重構。** 修好之前，只要角色包含附件編輯權限就存不起來。

⚠️ **提案原本寫「不動後端，後端擋對了」——那句話是錯的。**
後端沒有擋對，它是**因為錯的理由**擋下來的（要求一個不存在的碼）。
是實機驗收才發現的：前端修完之後錯誤訊息換了一個，但依然存不起來。
**只做靜態分析會停在錯的結論**——這一點值得記進 lessons。
