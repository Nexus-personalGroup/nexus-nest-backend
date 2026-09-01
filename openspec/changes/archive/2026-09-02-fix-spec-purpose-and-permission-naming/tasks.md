> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
>
> ⚠️ **改了 `PERMISSION_CATALOG` 的 `name` 一定要重跑 seed**（見 3.1）：
> 畫面讀的是 DB，不重跑會是「程式碼改了、畫面沒變」而查不到原因。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
> 反向驗證還要**確認紅的是哪一支**——上一支 change 踩過「別支守則的紅燈冒名頂替」。
>
> **塊的依賴**：第 2 塊的 5 份 Purpose 與守則**必須同一塊**——補完之前守則是紅的，
> 拆開會留下無法通過驗證的中間狀態。第 1 塊獨立。
>
> **這個 change 沒有 schema、migration、環境變數、API 契約、權限碼、前端程式碼變更。**

## 1. 權限名稱反映實際範圍

- [x] 1.1 `permissions.ts`：`BACKEND_MODERATION_VIEW` 的 name
      「後台-檢舉審閱-檢視」→「後台-聊天管理-檢視」
- [x] 1.2 ⭐ **`BACKEND_MODERATION_EDIT` 不改**，維持「後台-檢舉審閱-判定」。
      在該行旁邊寫註解說明不對稱是刻意的（見 design D2）——
      沒有註解的話下一個人會把它當成漏改
- [x] 1.3 檢查是否有測試或文件寫死了「後台-檢舉審閱-檢視」這個字串——沒有（只有 permissions.ts 本身）

## 2. 5 份 Purpose 與守則（同一塊）

- [x] 2.1 `api-dashboard`：快照是**一次性**的，SSE 推的是同一份快照而非增量
- [x] 2.2 `ui-dashboard`：數字會過期，而**看不出過期的數字比沒有數字更糟**
- [x] 2.3 `ui-member-profile`：**沒有列表可以進入**，只能從檢舉或聊天室帶著 ID 過來
- [x] 2.4 `ui-room-overview`：刻意**不看訊息內容**——審閱動線的入口，不是訊息瀏覽器
- [x] 2.5 `ui-moderation`：處置動作**無權限時 disabled 不隱藏**，與列內動作的規則相反
- [x] 2.6 ⭐ 五份都**不寫需求摘要**（「本 capability 定義 A、B、C」）——
      底下就寫著，重複一次只是讓人多讀一遍（見 design D3）
- [x] 2.7 `openspec-spec-format.spec.ts` 新增守則：Purpose 區塊非空且不含 `TBD`
- [x] 2.8 ⭐ 判定用「含 `TBD`」而非精確比對 archive 那串字——
      精確比對擋不住 `TBD - 待補` 這種「補一半」
- [x] 2.9 ⭐ 斷言**掃描範圍有效**（讀到非空的 spec 清單），掃不到就失敗
- [x] 2.10 ⭐ 訊息要說明 **`openspec archive` 不會自動補 Purpose**，
      不只是說「Purpose 有 TBD」——看到訊息的人多半正是剛 archive 完的那個
- [x] 2.11 ⭐ **反向驗證**：把任一份 Purpose 改回 `TBD - created by archiving...` → 紅；
      改成 `TBD - 待補` → 也要紅；清空 → 也要紅；還原 → 綠
- [x] 2.12 ⭐ **反向驗證要確認紅的是這一支**，不是整包 exit code
      （`grep -E "^\s+● 架構守則" | sort -u` 看清單）
- [x] 2.13 `openspec/project/testing.md` 的守則表補一列
      （`guardrail-inventory.spec.ts` 會要求）

## 3. 驗收與收尾

- [x] 3.1 ⭐ `docker compose exec api pnpm --filter @app/api db:seed`
- [x] 3.2 開角色 dialog：「聊天管理」底下是「後台-聊天管理-檢視」與
      「後台-檢舉審閱-判定」
- [x] 3.3 `pnpm typecheck && pnpm lint && pnpm test:cov` 全綠
- [x] 3.4 `openspec validate --specs --strict` 39/39
- [x] 3.5 `tasks/todo.md`：把「已知缺口」裡那條 5 份 TBD Purpose 移除
      ——**這條的存在本身就是提醒，補完要拿掉**，否則下次讀的人會再查一次
- [x] 3.6 `tasks/lessons.md`：本次沒有踩到新坑，不寫
- [x] 3.7 `openspec archive fix-spec-purpose-and-permission-naming`
      ——⭐ 封存後**立刻確認新守則沒有因為 archive 又產生 TBD 而變紅**
      （本 change 沒有新增能力，理論上不會，但那正是這支守則要抓的情況）
