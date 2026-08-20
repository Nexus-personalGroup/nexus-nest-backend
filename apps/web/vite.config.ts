/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 設定 Vite：React + Tailwind v4 + path alias + dev 期間將 /api proxy 到後端
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // 綁 0.0.0.0：容器內若只綁 127.0.0.1，從 host 對映的埠連不進來。
    // 直接在 host 跑不受影響。
    host: true,
    proxy: {
      '/api': {
        // 容器化開發時 api 是另一個 service，localhost 會指向 web 自己，
        // 故 target 可由 VITE_API_PROXY_TARGET 覆寫（compose 設為 http://api:3000）
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        // 後端在 main.ts 設了 setGlobalPrefix('api')，故不需 rewrite
      },
    },
    watch: {
      // macOS 的 bind mount 不會傳遞 inotify 事件，容器內必須改用輪詢才看得到檔案變更
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      // 黑名單模式：預設納入整個 lib / components，僅排除難以獨立單元測試的整合層。
      // 如此新增的純邏輯檔會自動進入門檻分母，逼著補測試，而非靠白名單手動加才被涵蓋。
      include: ['src/lib/**', 'src/components/**'],
      exclude: [
        // 依賴 React Router / API client context 的組合層，由 e2e 與手動驗證涵蓋
        'src/lib/use-current-member.ts',
        'src/lib/use-detail-dialog.ts',
        'src/lib/use-list-url-state.ts',
        'src/lib/use-infinite-scroll-sentinel.ts',
        'src/lib/use-is-first-run.ts',
        'src/components/RequireAuth.tsx',
        'src/components/RequireRole.tsx',
        'src/components/ErrorBoundary.tsx',
        'src/components/StatusFilterSelect.tsx',
        'src/components/DisabledHint.tsx',
        'src/components/data-table/**',
        // shadcn 生成的 UI 原子元件
        'src/components/ui/**',
        // 純常數對齊表，無邏輯可測
        'src/lib/role-codes.ts',
      ],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 60,
        lines: 75,
      },
    },
  },
});
