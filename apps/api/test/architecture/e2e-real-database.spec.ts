import {
  collectSourceFiles,
  findViolations,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * Hard Rule：e2e 對真實測試資料庫執行，不 mock 資料庫。
 *
 * mock 掉 Prisma 的 e2e 只是「測 mock 有沒有被呼叫」，抓不到 provider 建構子副作用、
 * env 空字串、adapter 即時計算欄位這類只有真 DI + 真 DB 才會浮現的問題。
 *
 * 除了禁止各 spec 覆寫，也禁止測試 helper **提供** mock 入口——留著入口等於官方
 * 認可的繞道，規則會形同虛設。
 */
describe('架構守則：e2e 對真實資料庫執行', () => {
  const specs = collectSourceFiles(['test'], {}).filter((f) =>
    f.endsWith('.e2e-spec.ts'),
  );

  it('掃描範圍有效', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it('e2e spec 一律放在 test/e2e/', () => {
    // jest.e2e.config.js 的 testRegex 是 `test/.*\.e2e-spec\.ts$`，放回平鋪一樣會被跑到，
    // 組織會靜默侵蝕回原狀。lifecycle 檔在 test/setup/、共用 helper 在 test/helpers/，
    // spec 只在 test/e2e/——三者分開才不會又混成一層。
    const misplaced = specs.filter((f) => !f.startsWith('test/e2e/'));

    expect(
      misplaced.length === 0
        ? ''
        : `以下 e2e spec 不在 test/e2e/：\n${misplaced
            .map((f) => `  ${f}`)
            .join(
              '\n',
            )}\ntest/ 的分工：e2e/ 放 spec、setup/ 放 jest lifecycle、helpers/ 放共用斷言與 fixture、architecture/ 放守則`,
    ).toBe('');
  });

  it('e2e 不得覆寫 PrismaService', () => {
    const offenders = findViolations(
      specs,
      /overrideProvider\(\s*PrismaService/,
    );

    expect(
      violationReport(
        offenders,
        'e2e 覆寫了 PrismaService：e2e 一律走真 test DB（庫名須含 test，globalSetup 有守門），mock 版看不到真實的 DI 與 DB 行為',
      ),
    ).toBe('');
  });

  it('setup/test-app.ts 不得提供 mock 資料庫的入口', () => {
    const source = readSource('test/setup/test-app.ts');
    const offenders: Violation[] = /^\s*prisma\?:/m.test(source)
      ? [
          {
            file: 'test/setup/test-app.ts',
            line:
              source.split('\n').findIndex((l) => /^\s*prisma\?:/.test(l)) + 1,
            text: 'TestAppOverrides 提供了 prisma override 欄位',
          },
        ]
      : [];

    expect(
      violationReport(
        offenders,
        'createE2EApp 的 overrides 提供了 mock 資料庫入口：請移除該欄位，否則「不得 mock DB」的規則形同虛設',
      ),
    ).toBe('');
  });
});
