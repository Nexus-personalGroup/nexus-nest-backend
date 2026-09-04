> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test:cov`
>
> **驗證一律看 exit code**，指令不接 pipe。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約變更。**
> ⚠️ **有後端變更**——原本以為沒有，實機驗收才發現後端有同一個缺陷（見第 0 塊）。

## 0. 修後端（實機驗收才發現的，而且它才是致命的）

> ⚠️ **提案原本斷言「後端擋對了、不用動」——那是錯的。**
> 前端修完之後錯誤訊息換成「設定 EDIT 時必須同時設定 VIEW」，依然存不起來。
> 後端 `validatePermissions` 有一模一樣的字串推導缺陷。

- [x] 0.1 ⭐ `validatePermissions` 只在該模組**確實提供** VIEW 時才要求它。
      它上一行才剛 `findByCodes` 查過目錄——**手上有資料卻沒用**
- [x] 0.2 ⭐ 該檔**零測試**（與前端那支一樣）。補六條，
      其中兩條是「模組只有 EDIT → 通過」與「混合」——**只有這兩條抓得到 bug**
- [x] 0.3 ⭐ 反向驗證：拿掉目錄判斷 → **正好那兩條紅**、其餘 4 條綠
- [x] 0.4 `api-role-management`「建立角色」的需求補上
      「該模組也提供 VIEW」的前提

## 1. 修 normalize

- [x] 1.1 ⭐ `normalizePermissionCodes` 改為接受**後端提供的權限碼集合**，
      只在該 module 同時有 VIEW 與 EDIT 時才補
      ——**不再字串推導**（那句「不需 permission 清單」的註解要一併刪掉，
      它就是這個 bug 的來源）
- [x] 1.2 ⭐ 清單未載入時**不補**而非臆測（design D2 的代價）
- [x] 1.3 `RolesPage` 取得權限清單並傳入。清單是既有的 query，
      多一次訂閱不是多一次請求

## 2. 測試

- [x] 2.1 ⭐ **`normalizePermissionCodes` 目前零覆蓋**。至少三條：
      同時有 VIEW/EDIT → 補；**只有 EDIT → 不補**；清單為空 → 不補
- [x] 2.2 ⭐ **「不補」那一半才是抓得到這個 bug 的**——
      只測正向的話，「永遠都補」的實作也會綠
- [x] 2.3 排序與去重的既有行為不得改變

## 3. 驗收

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 3.2 ⭐ **實機重現原始問題**：勾「附件 - 編輯」→ 儲存 → **「角色已新增」**。
      DB 確認只存了 `BACKEND:ATTACHMENT:EDIT` 一筆，沒有被塞進不存在的 VIEW。
      ⚠️ **就是這一步揭露了後端的缺陷**——前端修完之後錯誤訊息換了一個
- [x] 3.3 對照組：勾「管理者帳號 - 編輯」→ 檢視自動勾選且變灰（disabled）、
      存得起來。DB 確認存了 VIEW + EDIT **兩筆**——既有規則仍然生效
- [x] 3.4 `openspec validate fix-viewless-module-role-save --strict`

## 4. 收尾

- [x] 4.1 `tasks/todo.md`：整體整理（用 `tidy-todo`）；
      ⭐ 「已知缺口」補上「**requirement 內部的 bullet 也會互相矛盾**」
      ——那一條目前只寫了 Purpose 與 Requirements 之間的矛盾，
      而這次是同一形狀的第二次
- [x] 4.2 `tasks/lessons.md`：只在有新東西時才補
- [ ] 4.3 `openspec archive fix-viewless-module-role-save`
