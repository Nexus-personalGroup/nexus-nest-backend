## 這個 PR 做了什麼

<!-- 一兩句講清楚。與其描述改了哪些檔案，不如說明解決什麼問題 -->

## 背景與取捨

<!-- 為什麼是這個做法？考慮過哪些替代方案、為什麼沒選？
     走 openspec 流程的話直接連結 openspec/changes/<name>/ -->

N/A

## 怎麼驗證

<!-- 具體指令與預期結果。CI 已涵蓋的（typecheck / lint / test:cov / e2e）不必重複，
     這裡寫的是「CI 驗不到、需要人工確認」的部分 -->

N/A

## 相依

<!-- 需要先合併的 PR、要改的環境變數、要跑的 migration、部署順序 -->

N/A

## 截圖

<!-- 有 UI 改動才需要 -->

N/A

---

- [ ] `pnpm typecheck && pnpm lint && pnpm test:cov` 本機通過
- [ ] 動到 controller / 路由時已跑 `pnpm --filter @app/api test:e2e`
- [ ] 走 openspec 流程的變更已封存（`openspec archive <name>`）
