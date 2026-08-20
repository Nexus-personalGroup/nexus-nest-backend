import { defineConfig } from 'eslint/config';
import baseConfig, { houseRules } from '@app/eslint-config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/** ORM / 測試邊界共通放寬:查詢結果與 jest mock 天生為 any,no-unsafe-* 在此為雜訊非 bug */
const noUnsafeOff = {
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
};

/** controller 不得直接相依持久層:六角架構的內外隔離只能經 facade 穿越 */
const NO_PERSISTENCE = {
  group: [
    '**/prisma/prisma.service',
    '**/adapter/out/persistence/**',
    '**/*Repository',
  ],
  message:
    'controller 不得直接相依持久層:請改注入 facade(Facade → UseCase/Service → Port)',
};

/** 後台不得相依前台 */
const NO_FRONT = {
  group: ['**/front/**'],
  message: '後台不得相依前台:共用邏輯請下沉到 application / domain / shared',
};

/** 前台不得相依後台 */
const NO_ADMIN = {
  group: ['**/admin/**'],
  message: '前台不得相依後台:共用邏輯請下沉到 application / domain / shared',
};

/** 組出 no-restricted-imports 規則設定 */
const restrictImports = (...patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
});

export default defineConfig([
  // 共用基底:ignores + js recommended（不含 tseslint 預設,由本檔自帶）
  ...baseConfig,
  // 疊上 type-aware 規則(需 api 自身 tsconfig,故不放共用基底)
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        // typescript-eslint v8 新式 project 解析:自動對應最近的 tsconfig
        //(tsconfig.json 已涵蓋 src / scripts / seeds,無需逐一列 project）
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // 家規最後套:蓋回 recommendedTypeChecked 重新開成 error 的 no-explicit-any 等
  houseRules,
  // 深層相對路徑一律改走 @app/* alias。
  //
  // 刻意用**基礎** no-restricted-imports 而非 @typescript-eslint/ 版：後者已被下方五個
  // 分層邊界區塊使用，flat config 中同名規則是「後蓋前、不合併 patterns」，
  // 疊上去會把那五個區塊的限制洗掉。不同規則名才能安全共存。
  //
  // 門檻設在 4 層：2～3 層多半是同模組內的鄰近檔案，相對路徑反而比 alias 好讀；
  // 4 層以上已經跨越分層邊界，看不出指向哪裡。
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../../*'],
              message:
                '4 層以上的相對路徑請改用 @app/*（對應 apps/api/src/）。nest build 會在編譯時改寫成相對路徑，dist 不受影響。',
            },
          ],
        },
      ],
    },
  },
  // Prisma 持久層是 ORM 邊界:查詢結果 / mapper 天生 any,關掉 no-unsafe-* 家族
  {
    files: ['src/adapter/out/persistence/**/*.ts'],
    rules: { ...noUnsafeOff },
  },
  // seeds / 一次性腳本:資料組裝為主,同樣放寬 no-unsafe-*
  {
    files: ['seeds/**/*.ts', 'scripts/**/*.ts'],
    rules: { ...noUnsafeOff },
  },
  // 測試碼:jest mock 回傳 any、supertest res.body 為 any、unbound method 取用皆為慣例
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      ...noUnsafeOff,
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // .js 設定檔(jest.arch.config.js / jest.e2e.config.js):納入 lint 只為了擋語法錯誤——
  // 這類檔案沒有型別資訊(parserOptions.projectService 只設給 **/*.ts),
  // 不關掉 type-aware 規則會直接 crash。
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
  // 分層邊界:import 違規在 lint 期即攔截(跨檔語意規則由 test/architecture 的架構測試負責)
  // 用 @typescript-eslint 版而非 base 版,才會一併涵蓋 import type
  //
  // ⚠️ flat config 中同名規則是「後蓋前」而非合併 patterns,因此重疊的檔案範圍必須各自
  // 列出完整限制:admin 側的 controller 同時受「不得碰持久層」與「不得相依 front」約束,
  // 若拆成兩個區塊,後者會把前者整包覆蓋掉。
  {
    files: ['src/**/admin/**/*.ts'],
    ignores: ['src/adapter/in/**/*Controller.ts'],
    rules: restrictImports(NO_FRONT),
  },
  {
    files: ['src/**/front/**/*.ts'],
    ignores: ['src/adapter/in/**/*Controller.ts'],
    rules: restrictImports(NO_ADMIN),
  },
  {
    files: ['src/adapter/in/**/*Controller.ts'],
    ignores: ['src/**/admin/**', 'src/**/front/**'],
    rules: restrictImports(NO_PERSISTENCE),
  },
  {
    files: ['src/adapter/in/**/admin/**/*Controller.ts'],
    rules: restrictImports(NO_PERSISTENCE, NO_FRONT),
  },
  {
    files: ['src/adapter/in/**/front/**/*Controller.ts'],
    rules: restrictImports(NO_PERSISTENCE, NO_ADMIN),
  },
  // prettier 放最後:關掉與 prettier 衝突的格式規則,並把 prettier 違規當 lint error
  eslintPluginPrettierRecommended,
]);
