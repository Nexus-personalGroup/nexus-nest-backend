> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test`
> 動到 controller / 路由再加 `pnpm --filter @app/api test:e2e`；動到 module 接線 / path alias / 裝飾器再加 `pnpm build`；
> 動到 swagger yaml 再加 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> <!-- 交代塊與塊的依賴：哪幾塊互相獨立可先做、哪一塊是動 production code 前的安全網不可跳過。
>      例：塊 1～2 為 A 功能，與塊 3～4 獨立，可先做；塊 3 是改寄信前的 characterization test，不可跳過。 -->

<!--
  塊的切法（後端功能模組的預設順序，沒動到的階段直接刪掉）：
    Schema/Migration → Domain/Port → Exceptions → Services(TDD) → Out Adapter
    → Controller/DTO → Facade + Module → Swagger → 單元測試 → E2E → 驗證 → 收尾

  切塊的唯一標準是「能不能獨立驗證」，不是「概念上像不像一組」。
  有鏈式依賴的必須綁進同一塊——例如砍欄位會同時打到 service 與 seed，
  拆開就會留下一個編譯不過的中間狀態。
-->

## 1. <!-- 塊名稱 -->

- [ ] 1.1 <!-- 任務描述，要能驗證：做完你知道它是綠的 -->
- [ ] 1.2 <!-- ... -->

## 2. <!-- 塊名稱 -->

- [ ] 2.1 <!-- ... -->
- [ ] 2.2 **反向驗證**：<!-- 刻意改壞哪幾處 production code，逐一確認對應測試真的變紅，再改回來並確認 git diff 乾淨。改不紅的是假測試，重寫。 -->

## <!-- N -->. 收尾

- [ ] N.1 跑完整驗證鏈，貼出實際輸出（不要只寫「通過」）
- [ ] N.2 更新 `tasks/todo.md` 對應條目；新踩到的坑寫進 `tasks/lessons.md`
- [ ] N.3 <!-- 需要使用者手動執行的動作：跑 migration、改 .env、觀察首次 CI…… -->

<!--
  實作過程中的兩種常見狀況，直接寫在對應項目上，不要另開文件：

  取消的項目 —— 用刪除線 + 粗體結論 + 理由：
    - [x] 2.4 ~~前台 Controller 同步接上~~ —— **不需要**：FrontXxxController 繼承
          XxxController 且未覆寫，改一處即兩側生效（測試已涵蓋兩者）

  中途插入的塊 —— 用 5b 這種編號插在相關塊後面，並在塊標題下用一段話
  交代它為什麼被併進來（在哪一塊收尾時查出、經誰確認）。
-->
