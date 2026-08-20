import { defineConfig } from 'eslint/config';
import baseConfig, { houseRules } from '@app/eslint-config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/** 下層不得反向相依 routes（上層） */
const NO_ROUTES = {
  group: ['**/routes/**', '@/routes', '@/routes/**'],
  message:
    '下層不得反向相依 routes:需要的資料請由上層以 props / 參數傳入,或把共用邏輯下沉到 lib',
};

/** shadcn 生成的原子元件不得相依業務層,保持可重用 */
const NO_BUSINESS = {
  group: ['**/api/**', '@/api', '@/api/**'],
  message:
    'components/ui 為 shadcn 原子元件,不得相依 API 業務層:請在外層容器元件取資料後傳入',
};

/** 組出 no-restricted-imports 規則設定 */
const restrictImports = (...patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
});

export default defineConfig([
  // 共用基底:ignores + js recommended（不含 tseslint 預設,由本檔自帶）
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // 家規最後套:蓋回 tseslint recommended 的 no-explicit-any 等（與 api 一致）
  houseRules,
  // shadcn/ui 元件直接從官方 registry copy，內含 hook 與元件同檔、effect 內 setState 等
  // 與專案規範不同的模式。為避免每次 `shadcn add` 都要手動改 disable 註解，這裡集中關掉相關規則
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // 分層邊界:import 違規於 lint 期攔截。
  // 「routes 之間不得互相 import」無法用靜態 glob 表達（需知道「自己是哪個 route」），
  // 改由 src/test/architecture.test.ts 動態檢查——與後端「eslint 表達不了的交給測試」一致。
  //
  // ⚠️ flat config 同名規則後蓋前、不合併 patterns:components/ui 同時符合下方兩個
  // files 範圍,故第二個區塊必須把 NO_ROUTES 一併列出,否則會被整包覆蓋掉。
  {
    files: ['src/{lib,hooks,components}/**/*.{ts,tsx}'],
    rules: restrictImports(NO_ROUTES),
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: restrictImports(NO_ROUTES, NO_BUSINESS),
  },
]);
