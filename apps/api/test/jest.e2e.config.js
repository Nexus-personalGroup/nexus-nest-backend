/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // ts-jest 不讀 tsconfig 的 paths，須自行對應（本設定的 rootDir 是 apps/api，故要補 src/）
  moduleNameMapper: { '^@app/(.*)$': '<rootDir>/src/$1' },
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/setup-env.e2e.ts'],
  // 確保測試庫存在 + migrate deploy（守門僅 *_test 庫）
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  // 所有 spec 共用同一測試庫，序列執行避免互相 deleteMany race
  maxWorkers: 1,
  testPathIgnorePatterns: ['/node_modules/'],
  forceExit: true,
};
