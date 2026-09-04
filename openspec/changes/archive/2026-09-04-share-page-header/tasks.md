> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test:cov`
>
> **驗證一律看 exit code**，指令不接 pipe。
>
> ⚠️ **本 change 的程式碼在提案之前就寫好了**（見 proposal 的 Impact）。
> 因此下列項目多數是**回頭核對**而非依序執行——標記為 [x] 的是已完成並驗過的。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、後端變更。**

## 1. 共用元件

- [x] 1.1 `components/PageHeader.tsx`：標題、選填副標、選填動作區
- [x] 1.2 ⭐ **有無動作區的排版差異收進元件**——呼叫端不再自己決定要不要加 flex
- [x] 1.3 單元測試四條：標題與副標、無副標不渲染空段落、動作區、
      ⭐ **有動作區才套 `justify-between`**（那是元件存在的一半理由）

## 2. 遷移

- [x] 2.1 八個列表頁：`members` / `roles` / `front-users` /
      `moderation/reports` / `moderation/rooms` /
      `security/ip-whitelist` / `security/ip-blacklist` / `security/account-locks`
- [x] 2.2 `moderation/dashboard` 的**兩個狀態**（載入中／載入完成）
      ——不換的話同一頁會有兩種寫法
- [x] 2.3 ⭐ **明細頁不動**（design D2）：五頁的頁首是返回鍵 + 動態標題 +
      行內徽章，形狀真的不同
- [x] 2.4 確認沒有殘留的手寫頁首：`grep 'text-2xl font-'` 之後，
      剩下的都是明細頁與統計數字，不是頁首

## 3. 收尾

- [x] 3.1 `pnpm typecheck` / `pnpm lint` / web 測試（142 passed）
- [ ] 3.2 `pnpm typecheck && pnpm lint && pnpm test:cov` 全鏈
- [ ] 3.3 `openspec validate share-page-header --strict`
- [ ] 3.4 ⚠️ **視覺回歸只能靠人看**：純結構重構沒有自動化的驗證方式。
      八個列表頁逐一開過，確認與遷移前相同
      （帳號鎖定頁除外——它本來就是歪的，這次一併對正）
- [ ] 3.5 `tasks/todo.md`：技術債那條改成已完成（用 `tidy-todo`）
- [ ] 3.6 `openspec archive share-page-header`
