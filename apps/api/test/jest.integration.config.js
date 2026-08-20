/**
 * 整合測試：跨行程、跨實例的行為，用真 Redis 與真資料庫。
 *
 * 與 e2e 分開的理由：e2e 驗的是「一個實例內的 API 行為」且把 Redis mock 掉；
 * 這裡驗的是「多個實例之間」，兩者的前置條件相反，混在一起會讓
 * mock 與真連線在同一個 process 裡打架。
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: { '^@app/(.*)$': '<rootDir>/src/$1' },
  rootDir: '..',
  testRegex: 'test/.*\\.integration-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/setup-env.integration.ts'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  // 每支測試都會佔用實際埠號並連 Redis，序列執行避免互搶
  maxWorkers: 1,
  // 兩實例情境需要起兩個完整的 NestJS app，比 e2e 慢
  testTimeout: 60_000,
  testPathIgnorePatterns: ['/node_modules/'],
  forceExit: true,
};
