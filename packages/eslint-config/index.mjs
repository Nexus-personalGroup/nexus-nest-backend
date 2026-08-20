// @ts-check
import js from '@eslint/js';

/**
 * 專案家規:交由各 workspace 於「自己的 tseslint 預設集之後」套用
 *(否則 recommended / recommendedTypeChecked 會把這裡的覆寫蓋回去)。
 */
export const houseRules = {
  files: ['**/*.{ts,tsx,mts,cts}'],
  rules: {
    // any 只警告不擋:既有程式仍有少量 any,採漸進收斂而非一次擋死
    '@typescript-eslint/no-explicit-any': 'warn',
    // 不強制顯式回傳型別:內部函式交給 TS 推斷,public API 自律
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};

/**
 * Monorepo 共用 ESLint 扁平設定基底。
 * 刻意「不含」任何 typescript-eslint 預設集——因為 api 走 type-aware
 *(recommendedTypeChecked)、web 走一般(recommended),各自的預設集都會註冊
 * `@typescript-eslint` 外掛;若基底也註冊一次會觸發「Cannot redefine plugin」。
 * 故 tseslint 預設集由各 workspace 自行帶入(且僅帶一組),基底只放共用的
 * ignores 與 JS recommended,家規則以 named export 交由各 workspace 最後套用。
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.d.ts'],
  },
  js.configs.recommended,
];
