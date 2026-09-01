> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **但那三個指令驗不到「畫面在不在說謊」**——真正的驗收是
> 開**超級管理者**的唯讀檢視看一次（第 3 塊）。這個 bug 就是那樣被發現的。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠，
> 並確認**紅的是哪一支**。
>
> **塊的依賴**：第 2 塊的測試要在第 1 塊之後（改之前舊測試是綠的、改之後才需要換）。
>
> **這個 change 沒有 schema、migration、環境變數、API 契約、權限碼、seed 變更。**

## 1. 安全管理區塊改為純說明列表

- [x] 1.1 `PermissionsField.tsx` 的 `UnassignableGroup`：拿掉三個 `Checkbox`，
      改為帶鎖圖示（`lucide-react` 的 `Lock`）的文字項目
- [x] 1.2 ⭐ 區塊內加一句「這些功能不透過角色權限指派」——
      **拿掉方框之後這一區會不像權限**，需要一句話補回它是什麼
- [x] 1.3 保留虛線邊框、「限超級管理者」badge、說明理由的 tooltip 與區塊位置
      （見 design D3：只有 checkbox 是錯的，只換它）
- [x] 1.4 ⭐ 更新該元件的 TSDoc——原本寫著「checkbox 恆為 disabled 且不接 handler」，
      那段描述已經不成立，留著會誤導

## 2. 測試同步

- [x] 2.1 ⭐ 移除「三項皆 disabled checkbox」與「點擊不改變 permissionCodes」兩支，
      改為**斷言該區塊不含任何 `role="checkbox"`**（見 design D2：這是更強的保證）
- [x] 2.2 ⭐ 新增一支：**檢視超級管理者時該區塊不得出現未勾選的方框**
      ——這是本次 bug 的直接回歸測試，用「整區沒有 checkbox」涵蓋
- [x] 2.3 保留「區塊存在且標示限超級管理者」與 tooltip 理由的斷言
- [x] 2.4 ⭐ **反向驗證**：把 `Checkbox` 加回該區塊 → 紅（且只有這一支）；拿掉 → 126 全綠。
      **第一次跑是空轉的**——shell 的工作目錄還停在 `apps/web`，相對路徑寫檔失敗，
      而測試照樣印 126 passed。改用絕對路徑後才真的驗到

## 3. 驗收與收尾

- [x] 3.1 ⭐ 開**超級管理者**的唯讀檢視（`/roles` → ⋯ → 檢視）：
      安全管理區塊沒有任何方框，三項以文字 + 鎖圖示呈現
- [x] 3.2 開「新增角色」：同一區塊呈現一致，且勾任一 EDIT 後 VIEW 仍自動勾選並鎖定
- [x] 3.3 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 3.4 `openspec validate --specs --strict` 39/39
- [x] 3.5 `tasks/lessons.md`：補「用 checkbox 表達不是勾選狀態的東西」
      ——**這條值得寫**：#32 的單元測試全綠、守則全綠、我自己也開瀏覽器看過，
      但只看了「新增角色」那個情境，沒看檢視既有角色
- [x] 3.6 `openspec archive fix-unassignable-permission-display`
