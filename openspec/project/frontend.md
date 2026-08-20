# 前端架構與 API client

> apps/web 目錄結構、前端慣例、shadcn 整合，以及 packages/api-client 的設計。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

## 前端架構（apps/web/src/）

```
apps/web/src/
├── api/
│   ├── client.ts        # apiClient singleton + 401 onResponse middleware；export useApiQuery / useApiMutation
│   └── query-client.ts  # 共用 QueryClient（admin 工具用 refetchOnWindowFocus: false）
├── components/
│   ├── ui/              # shadcn 元件落地處（由 components.json 管）
│   └── RequireAuth.tsx  # 路由保護 guard，未登入導向 /login
├── routes/
│   ├── _layout.tsx      # Sidebar 共用 layout
│   ├── login/page.tsx
│   └── home/page.tsx
├── lib/                 # cn()、tokenStorage 等 utils
├── App.tsx              # Router + QueryClientProvider + TooltipProvider
├── main.tsx
└── index.css            # Tailwind v4 + shadcn theme tokens
```

### 前端慣例

- **路徑別名**：`@/*` → `src/*`（在 `tsconfig.app.json` 的 `paths` 與 `vite.config.ts` 的 `resolve.alias` 雙邊設定）。
- **API 呼叫**：一律走 `import { useApiQuery, useApiMutation } from '@/api/client'`；不要自己寫 `fetch` 或 axios。型別由 `@app/api-client` 從 OpenAPI 推導，IDE 自動補全。
- **表單**：react-hook-form + zod + **`standardSchemaResolver`**（從 `@hookform/resolvers/standard-schema` 引入，**不要**用 `zodResolver`，與 zod 4.1+ 型別簽章衝突）。
- **token 儲存**：admin 工具，access token 存 `localStorage`，key = `access_token`；統一從 `@/lib/storage` 的 `tokenStorage` 存取，**不要**散在各檔案。
- **401 處理**：`apiClient.use({ onResponse })` 全域 middleware 處理（清 token → 跳 `/login`），page 元件不需要再 catch。
- **shadcn 元件**：執行 `cd apps/web && pnpm dlx shadcn@latest add <name>` 加入。`form` 元件目前 nova preset 缺貨，**已自寫**於 `src/components/ui/form.tsx`（標準 shadcn 模板），更新 shadcn 時注意保留。
- **UI 文字**：一律繁體中文 hardcode，**不導入 i18n 框架**。註解亦只用繁體中文。
- **Lint exception**：`src/components/ui/**` 與 `src/hooks/use-mobile.ts` 是 shadcn 直接 copy 的官方範本，與專案 lint 規則不同的部分（hook 與元件同檔、effect 內 setState）在 `eslint.config.js` 集中 disable。

### 已知取捨：localStorage token × 無 CSP

**這是知情的取捨，不是疏漏。** fork 這個模板的人要清楚自己承擔什麼：

`tokenStorage` 把 access 與 **refresh 兩枚 token 都放 `localStorage`**，任何 XSS 都能一次帶走
長效憑證。同時 `apps/api/src/main.ts` 的 `helmet({ contentSecurityPolicy: false })`
關掉了 CSP——理由（Swagger UI 需要 inline script）對 `/api/*/docs` 成立。

單獨看各有道理，但**單一埠部署時兩者會疊在同一個 origin 上**：`ServeStaticModule` 讓 API
一併服務 `apps/web/dist`，而 helmet 是全域 middleware，SPA 自己的 HTML 也跟著沒有 CSP。
於是「無 CSP 的頁面」與「localStorage 裡的長效 refresh token」變成同源。

以 admin 後台工具、部署在受控網段的預設情境，這個風險可接受。要收斂的話依成本排序：

1. **只對 Swagger 路徑關閉 CSP**，其餘路徑給一份合理 policy。改動最小、收益最直接。
2. **refresh token 改走 `httpOnly` + `SameSite=Strict` cookie**，access token 留在記憶體。
   `cookieParser` 與 `COOKIE_SECRET` 都已就緒，但會動到前端的換發流程，屬獨立的 change。

---

## API client（packages/api-client/）

- **Source-first 設計**：`package.json` 的 `exports.types` / `exports.default` 直接指 `src/index.ts`。Vite / tsc 直接吃 TS，**無 dist build**。
- **產生流程**：
  1. 後端改 controller / Swagger yaml。
  2. `pnpm --filter @app/api swagger:bundle` 重新打包兩份 bundle（`docs/swagger/admin/openapi.bundle.yaml` 與 `docs/swagger/front/openapi.bundle.yaml`）。
  3. `pnpm --filter @app/api-client generate` 讀 bundle 產生 `src/schema.ts`。
- `schema.ts` **進 git**：API 變動會在 PR diff 中可見，CI 可比對是否與 bundle 同步。
- **自動 unwrap**：`createApiQueryHooks` 內部會剝開後端的 `{ success, data, timestamp }` 外殼，page 元件直接拿 `data`。
