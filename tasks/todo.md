# 專案 TODO

> 跨模組待辦清單。每次新 session 先讀；實作中發現新 TODO 立即記錄，**完成當下就回頭勾掉**（模板曾有兩條早已完成的待辦掛了近一個月，讓人誤判專案現況）。
> 排序原則：近期可動 → 需等外部條件 → 延後技術債。

## 進行中

- **M0 專案骨架**：模板落地 → PostgreSQL 轉換 → GitHub Actions 遷移。驗收＝`docker:deps` / `db:migrate` / `typecheck` / `lint` / `test` / `build` 六項全綠。

## 待辦

### 近期里程碑（nexus 專屬）

> Phase 1 只做即時聊天，做到 production 等級。前台另開專案，`apps/web` 為純後台管理。

- **M1 WS 地基**：連線、JWT 認證、Redis presence、`@socket.io/redis-adapter` 跨實例廣播、CLI 測試客戶端。驗收＝起兩個 API 實例，A 實例送出的訊息 B 實例的連線收得到。
- **M2 聊天核心**：房間、訊息、`clientMessageId` 去重、ack 確認、room 內自增 `seq`、斷線補齊。
- **M3 監控埋點**：Prometheus metrics + `chat_audit_log` + 管理員稽核表。**介面可以晚做，埋點不能晚做**——這類資料無法回溯補齊。
- **M4 後台介面**：SSE 即時儀表板、使用者 360 視圖、聊天室總覽、檢舉佇列與處置。

### 需人工處理（AI 做不到）

- **`.env.example` 補 `ALLOW_PROD_SEED`**：`envSchema` 已宣告，但 `.env.example` 尚未加。此檔在 AI 的權限設定中被拒絕存取，需開發者手動加一行 `ALLOW_PROD_SEED=`（註明僅正式環境用）。

- **首次 CI pipeline 需人工觀察**：遷移到 GitHub Actions 後首跑要確認 (1) `quality-check` 與 `e2e-test` 是否在 PR 觸發；(2) cache 是否命中；(3) pipeline 總時長可否接受，過慢可把 `e2e-test` 限縮為只在 PR 跑。

### 觀察中（繼承自模板）

- **e2e 有間歇性失敗**：模板期間發生 2 次，皆重跑後全綠、無法重現。共同點是「緊接在另一個會寫檔案的指令之後的第一次執行」——懷疑與 ts-jest 快取或檔案 mtime 有關，未證實。**下次務必用 `test:e2e > /tmp/x.log 2>&1` 保留完整輸出**——前兩次都因為用 grep 管線過濾而沒留下失敗的測試名稱，這是查不下去的主因。

- **傳遞依賴漏洞**：模板期間已把能直接控制的修完，剩餘皆深埋在 `prisma` / `@nestjs/terminus` 等上游相依樹中，**刻意不加 override 強制提版**——相容風險大於收益。轉 PostgreSQL 後依賴樹會變（少了 `mysql2`），需重跑 `pnpm audit` 重新盤點。

### 延後功能（繼承自模板的預留）

- **帳號鎖定管理 CRUD（`add-account-lock-management`）**：後端 `GET/POST /api/admin/security/locks`、`DELETE …/:id`；前端 `/security/account-locks` 列表頁。沿用 SUPERADMIN role gate。**優先度低於 M1–M4**。

### 技術債（外部相依卡住，延後）

> **處理原則**：卡在上游生態，不是本專案能單方面解決的。改動範圍大且會動搖 build baseline，要動請另開 change 並先確認條件已滿足，不要夾帶在功能開發裡。

- **`moduleResolution: node`（node10）遷移 `nodenext`**：TS 7.0 會移除 node10。現狀處置：api 已對齊 TS 6.0.2，`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音 + `rootDir: "."`。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**——NestJS 裝飾器 metadata 要求 `@Body()` DTO 用 `import type`，但注入的 service 不能改否則 DI 壞掉，與 TS 版本無關、卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時消音會失效，屆時強制處理。

---

## 已完成

（nexus 尚未有已完成項目。模板時期的變更歷史留在 `hexagonal-nest-express-mysql` repo，未帶入本專案。）
