> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
>
> **驗證一律看 exit code**，指令不接 pipe。
> 反向驗證要**兩邊都看**、並確認**紅的是哪一支**。
>
> **塊的依賴**：1 → 2 → 3 依序（型別要先在，守衛才有東西可用）。
>
> **這個 change 沒有 schema、migration、新環境變數、API 契約、後端變更。**

## 1. 權限碼型別化

- [x] 1.1 `apps/web/src/lib/permission-codes.ts`：`PERMISSION_CODE` 常數
      + `PermissionCode` 型別，**比照既有的 `role-codes.ts` 形狀**，不發明新寫法
- [x] 1.2 值**逐一比對** `PERMISSION_CATALOG`，
      只收 `apps/web` 實際用得到的，不整份複製
- [x] 1.3 ⭐ `_nav-items.ts` 的 `requiredPermission` 型別從 `string`
      收緊為 `PermissionCode`——**這一步才是真正消滅打錯的那道**，
      守則是第二道
- [x] 1.4 既有的裸字串換成常數；`useHasPermission` 的參數型別一併收緊

## 2. 路由守衛

- [x] 2.1 `RequirePermission` 元件，形狀比照 `RequireRole`
      （包在 `element` 外面，不做成 HOC 或 route config）
- [x] 2.2 ⭐ 共用的「無權限」畫面：**就地渲染**，內容含狀態、出路、
      以及**缺少的權限碼**（內部後台，使用者拿得到碼才說得出自己要什麼）。
      MUST NOT 導頁、MUST NOT 用 `/403` 路由
- [x] 2.3 ⭐ **`RequireRole` 一併改成同一種表現**——否則 codebase 會有
      兩種「沒權限」。⚠️ 這是 security 頁面的行為變更
- [x] 2.4 `App.tsx` **10 條路由**掛上守衛（含 5 條明細路由）。
      ⚠️ 明細路由顯式宣告，守則抓不到它們（design D4）
- [x] 2.5 `isLoading` 時 MUST NOT 閃一下無權限畫面（比照 `RequireRole` 回 `null`）
- [x] 2.6 單元測試：有權限 → 渲染內容；無權限 → 顯示訊息且**不渲染內容**；
      載入中 → 兩者都不渲染。⭐ 缺「不渲染內容」那半的話，
      「永遠渲染 + 額外顯示訊息」也會綠

## 3. 守則

- [x] 3.1 前端權限碼必須存在於後端的 `PERMISSION_CATALOG`
- [x] 3.2 路由與 sidebar 對同一 path 的權限碼必須一致
- [x] 3.3 ⭐ 斷言掃描範圍有效（讀不到常數或讀不到後端目錄要紅）
- [x] 3.4 ⭐ **反向驗證三條**：加一個不存在的權限碼 → 紅；
      讓路由與 sidebar 宣告不一致 → 紅；把常數檔改名 → 紅。
      每條都確認**紅的是哪一支**
- [x] 3.5 `openspec/project/testing.md` 的守則表補列

## 4. 收尾

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
      （web 的覆蓋率門檻 75/75/60/75，新增元件要有測試）
- [x] 4.2 `pnpm build` —— 動到路由與元件，`vite build` 要過
- [x] 4.3 ⭐ 實機驗收。⚠️ **做法與提案不同**：種子只有 SUPERADMIN 一個帳號，
      而它擁有全部權限，構造不出「缺權限」的正向情境。
      改為暫時反轉守衛的判斷，確認畫面**在真實路由樹裡**渲染得出來——
      標題、出路、權限碼三者都在，且不導頁、不渲染頁面內容、sidebar 完整。
      正向（superadmin 進 `/roles`）另外驗過。驗完立即還原並重跑 web 測試（138 passed）
- [x] 4.4 `openspec validate guard-routes-by-permission --strict`
- [ ] 4.5 `tasks/todo.md`：整體整理（用 `tidy-todo`）
- [ ] 4.6 `tasks/lessons.md`：只在有新東西時才補
- [ ] 4.7 `openspec archive guard-routes-by-permission`
