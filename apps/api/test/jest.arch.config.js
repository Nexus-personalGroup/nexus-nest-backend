/**
 * 架構守則測試的獨立 jest 設定。
 *
 * **為何放 `test/` 而非與單元測試一起 co-located 在 `src/`**：架構測試掃的是「整個專案的結構」，
 * 不屬於任何單一模組，放進 `src/` 會被 `collectCoverageFrom` 納入統計分母、也和「一個 spec 對一個
 * 受測檔」的慣例衝突。`test/` 裝的正是這類需要獨立 config 的東西（e2e 要真 DB、架構測試不載
 * setup-env）。`tsconfig.json` 的 include 已涵蓋整個 `test/` 目錄，所以仍受 `pnpm typecheck` 保護。
 *
 * 與單元測試（package.json 的 jest 欄位，rootDir: src）分開的理由：主設定的 rootDir 掃不到
 * `test/`；而改主設定的 rootDir 會位移 coverageThreshold 的統計分母。
 * 此處純靜態掃描原始碼，不需要 setupFiles / DB / Redis。
 *
 * 對應的前端說明（為何 web 反而放在 `src/`）見 `apps/web/src/test/architecture.test.ts` 檔頭。
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // ts-jest 不讀 tsconfig 的 paths，須自行對應（本設定的 rootDir 是 apps/api，故要補 src/）
  moduleNameMapper: { '^@app/(.*)$': '<rootDir>/src/$1' },
  rootDir: '..',
  testRegex: 'test/architecture/.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
