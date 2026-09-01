> 驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`
> **但這個 change 是文案與版面，那三個指令驗不到「看起來對不對」**
> ——真正的驗收是**開瀏覽器用不同權限的帳號各看一次**。
>
> **驗證一律看 exit code**，反向驗證要**兩邊都看**：破壞後紅、還原後綠。
>
> **塊的依賴**：兩塊互相獨立，可任意順序。
>
> **這個 change 沒有 schema、migration、環境變數、API 變更。純前端。**

## 1. Sidebar 依「管理誰」分組

- [x] 1.1 `_nav-items.ts` 改 group 與 label：

      | path | group | label |
      | --- | --- | --- |
      | `/members` | 管理者與權限 | 管理者帳號 |
      | `/roles` | 管理者與權限 | 角色權限 |
      | `/front-users` | 會員管理 | 會員列表 |
      | `/moderation/*` | 聊天管理（不變） | 不變 |
      | `/security/*` | 安全管理 | 不變 |

- [x] 1.2 ⭐ **拿掉 `/front-users` 上方那段「標籤不能只叫會員」的註解**——
      它描述的是舊解法（靠前綴區分）。留著會讓下一個人以為前綴還是必要的，
      而現在區別由分組承擔。改寫成說明「為什麼分兩組」
- [x] 1.3 ⭐ **「角色權限」歸在管理者那組**：RBAC 只作用於後台帳號，
      前台使用者沒有角色的概念。這個歸屬本身在說明一件容易誤解的事
- [x] 1.4 `members/page.tsx`、`front-users/page.tsx` 的標題與說明文字對齊新命名
      ——Sidebar 說「管理者帳號」而內頁說「會員管理」會比原本更混亂
- [x] 1.5 前端測試：若有斷言 Sidebar 標籤的測試需同步
- [x] 1.6 ⭐ 反向驗證：把兩個入口改回同一個 group →
      `platform-frontend-conventions` 與 `ui-user-management` 的
      「MUST 分屬不同 group」scenario 要能指出違規（人工檢查即可，
      這條沒有自動化守則——見 design 的取捨）
- [x] 1.7 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0

## 2. 首頁

- [x] 2.1 ⭐ 拿掉「管理後台骨架已建立完成，後續會接上會員、角色、權限等模組」
      ——那三個模組**全部接完了**。順帶拿掉 `/me` 那段的「**示範**」註解
- [x] 2.2 ~~快速入口由 `NAV_ITEMS` 衍生~~ —— **整張卡拿掉了**（design D4）。
      實作完看畫面才確認：Sidebar 常駐且不可收起，首頁再列一次是純粹的重複。
      這正是 design 的 Risks 裡列的那條風險，而它成真了
- [x] 2.3 ~~權限過濾沿用 Sidebar 的判定~~ —— **連帶收回為此抽出的 `filterNavItems`**：
      那個抽象唯一的目的是給首頁共用，**沒有第二個呼叫端就不該存在**。
      `_layout.tsx` 已完全還原（`git diff` 無差異）
- [x] 2.3b ⭐ **時間戳改用絕對時間且含日期**（design D4b）：
      第一版用 `formatRelativeTime`（「剛剛」），但首頁的數字不會自動更新
      ——頁面開著不動「剛剛」會一直是「剛剛」。而只有時分的話跨日會被當成今天的。
      實際渲染後再改成 24 小時制：`下午11:23` 在 zh-Hant 下不帶空格、黏在一起
- [x] 2.4 營運摘要：有 `BACKEND:MODERATION:VIEW` 才渲染，
      重用既有的 `GET /moderation/dashboard` 快照端點（**不是新端點**）。
      顯示 `onlineMembers` / `pendingReports` / `messagesToday`，
      並帶 `generatedAt`——一組沒有時間戳的即時數字，在連線中斷後
      看起來與即時數字一模一樣
- [x] 2.5 ⭐ **無權限就整塊不渲染**（design D5），
      MUST NOT 顯示「無權限」佔位或空數字。
      判準：導覽與資訊揭露用隱藏，**動作**才用 disabled + 說明理由
- [x] 2.6 個人資料卡保留
- [x] 2.7 ⭐ **改成自動化測試而非人工登入兩次**（`home/page.test.tsx`，6 條）：
      seed 只有一個 SUPERADMIN，要驗低權限得先開帳號、設角色、再登入一次，
      而那個流程每次驗證都要重跑。寫成測試之後它每次 `pnpm test` 都跑。
      反向驗證：拿掉權限 gate → 「整塊不渲染」那條紅；
      時間戳改回相對時間 → 「絕對時間且含日期」那條紅。還原後 6/6 綠
- [x] 2.8 驗證：`pnpm typecheck && pnpm lint && pnpm test` exit 0

## 3. 收尾

- [x] 3.1 跑完整驗證鏈並**貼出實際 exit code**
- [x] 3.2 ⭐ **人工驗收**：`http://127.0.0.1:8080`（走 nginx）以 SUPERADMIN 看過，
      四組分類與營運摘要都正確。**(b) 低權限那半改由 2.7 的測試涵蓋**
      ——seed 只有一個 SUPERADMIN，而人工開帳號的流程每次驗證都要重跑。
      **看畫面才發現的兩件事**：功能入口卡與 Sidebar 重複（拿掉，見 D4）、
      `下午11:23` 在 zh-Hant 下不帶空格（改 24 小時制）
- [x] 3.3 更新 `tasks/todo.md`：路線圖加這個 change；
      **把「首頁的模板佔位文字刻意沒改」那條從已知缺口移除**——它不再成立
- [x] 3.4 新踩到的坑寫進 `tasks/lessons.md`
- [x] 3.5 `openspec archive improve-admin-orientation`，
      並檢查三支既有 spec 的 `## Purpose` 有沒有跟新的 Requirements 打架
      （`ui-home` 是新的，Purpose 一併寫）
