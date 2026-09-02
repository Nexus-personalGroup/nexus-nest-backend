> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **第 1 塊做完要跑 `swagger:bundle` + `api-client generate`**，否則第 3 塊沒有型別可用。
> **動到 controller，第 1 塊必須跑 `pnpm --filter @app/api test:e2e`。**
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：1 → 2 → 3 依序（後端契約 → swagger/型別 → 前端）。
>
> **這個 change 沒有 schema、migration、環境變數、新權限碼。**
> 鎖定狀態已經在 `members.locked_at`，不需要新表。

## 1. 後端：帳號鎖定列表查詢

- [x] 1.1 ⭐ `AccountLockPort` 新增 `listLocks(params)`——**放這裡而不是 member 的持久層 port**：
      到期判定（`locked_at + APPLICATION_ACCOUNT_LOCK_DURATION_MIN`）已在該 port 的
      adapter 裡，列表自己算一次會漂移（見 design D3）
- [x] 1.2 `PrismaAccountLockAdapter` 實作 `listLocks`：分頁、email 模糊搜尋（不分大小寫）、
      `status` 過濾、`lockedAt DESC`
- [x] 1.3 ⭐ **每一列回傳判定後的 `status` 與 `unlocksAt`**，不要只回 `lockedAt`
      ——管理員要判斷的是「還要等多久」
- [x] 1.4 port-in（`SecurityUseCases`）加 `ListAccountLocksUseCase`；service 實作
- [x] 1.5 controller 加 `GET locks`，query 用 zod schema（`status` 用 `z.enum`，非法值 400）
- [x] 1.6 facade 接線；沿用既有的 `RolesGuard + @Roles(SUPERADMIN)`，**不加權限碼**
- [x] 1.7 單元測試：預設只回 locked、`status=expired` 回已到期、`status=all` 兩者都回
- [x] 1.8 ⭐ 邊界兩側各一支，且**同一筆資料餵給 `checkLock` 要得到同樣結論**
      ——只驗列表自己會漏掉「兩份規則漂移」那個真正的風險
- [x] 1.9 e2e：非 SUPERADMIN 403、未登入 401、非法 `status` 400、空清單 200
- [x] 1.10 ⭐ **反向驗證**：把到期判定改成永遠回 `locked` → 1.8 必須紅；還原 → 綠
- [x] 1.11 swagger yaml 新增該 endpoint，`pnpm --filter @app/api swagger:bundle`

## 2. 型別同步

- [x] 2.1 `pnpm --filter @app/api-client generate`
- [x] 2.2 `pnpm --filter @app/api swagger:check` 確認無漂移

## 3. 前端：帳號鎖定列表頁

- [x] 3.1 `_nav-items.ts` 加「帳號鎖定」到「安全管理」群組（`LockKeyhole` 圖示）
- [x] 3.2 `/security/account-locks` 頁面 + DataTable（5 欄），
      檔案結構照 `security/ip-whitelist/` 的形狀（components / hooks / lib）
- [x] 3.3 ⭐ 狀態用 Badge 區分「鎖定中 / 已到期」，**不要只顯示時間讓人心算**
- [x] 3.4 ⭐ 「自動解鎖時間」同時顯示相對時間（「還有 12 分鐘」）
- [x] 3.5 狀態過濾（鎖定中 / 已到期 / 全部，預設鎖定中）+ URL query 同步
- [x] 3.6 解鎖呼叫既有的 `POST unlock-account`（帶該列 email），需確認對話框並說明後果
- [x] 3.7 ⭐ **已到期的列：解鎖 disabled + 說明「已自動解鎖」，不是隱藏**
      ——資料狀態與權限不足的呈現規則相反（見 design D5）
- [x] 3.8 ⭐ 空狀態文案是「目前沒有帳號被鎖定」——那是好消息，
      「無資料」看起來像載入失敗
- [x] 3.9 前端測試：已到期的列不得有可按的解鎖；空狀態文案正確
- [x] 3.10 ⭐ **反向驗證**：把已到期的列改成可按 → 3.9 必須紅；還原 → 綠

## 4. 驗收與收尾

- [x] 4.1 ⭐ 實機（經 nginx 打 API）：造一鎖定中一已到期 → 預設只回鎖定中、
      `status=all` 兩筆狀態正確、`unlocksAt` 正確、非法 status 400。
      ⚠️ **畫面那半沒跑到**：瀏覽器擴充中途斷線。Badge 與 disabled 解鎖由
      `AccountLocksTable.test.tsx` 涵蓋且做過反向驗證，但**版面沒有人眼看過**
      ---
      ⚠️ 驗收時發現 api 容器 `(unhealthy)`——`node --watch` 在前一支跑
      `pnpm build` 清掉 dist 時死了。**那正是 #35 healthcheck 要抓的**：
      在它之前這裡只會顯示「Up 13 hours」，看起來完全正常
- [x] 4.2 ⭐ 解鎖 → 204、列表該筆消失、該帳號登得進去。
      ⚠️ **但這個驗證證明不了什麼**：帳號鎖定的 flag 是關的，所以**解鎖前也登得進去**
      （200 → 204 → 200）。要真的驗「鎖住的人登不進去、解鎖後才可以」，
      必須先開 `APPLICATION_ACCOUNT_LOCK_ENABLED`。這正是 D6 的來源
- [x] 4.3 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 4.4 `pnpm --filter @app/api test:e2e` 全綠
- [x] 4.5 `openspec validate --specs --strict` 通過
- [x] 4.6 `tasks/todo.md`：從「延後功能」移除，並註明**範圍比原記載小**
      （沒做 POST 手動鎖定與 DELETE 解鎖，理由見 design D1 / D2）
      ——不註明的話下一個人會以為做漏了
- [x] 4.7 `tasks/lessons.md`：補「功能有 flag 時，讀那份資料的畫面要能分辨『沒有』與『不會有』」
- [x] 4.8 `openspec archive add-account-lock-management`
