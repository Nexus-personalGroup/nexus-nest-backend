import {
  collectSourceFiles,
  importPathOf,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * Hard Rule：controller 不得直接相依持久層。
 *
 * 分層是 Facade → UseCase / Service → Port，controller 只認 facade 與 DTO。
 * 一旦 controller 直接注入 Prisma 或 repository，六角架構的內外隔離就被穿透，
 * 之後替換持久層或寫服務層測試都會被綁死在 ORM 上。
 */
describe('架構守則：controller 不得相依持久層', () => {
  // controller 命名慣例為 PascalCase 的 XxxController.ts（非 xxx.controller.ts）
  const controllers = collectSourceFiles(['src/adapter/in'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  const isPersistenceImport = (path: string): boolean =>
    /PrismaService|PrismaClient|prisma\.service|adapter\/out\/persistence/.test(
      path,
    ) || /Repository$/.test(path);

  it('掃描範圍有效', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('controller 不得 import Prisma 或 repository', () => {
    const offenders: Violation[] = [];

    for (const file of controllers) {
      readSource(file)
        .split('\n')
        .forEach((text, index) => {
          const path = importPathOf(text);
          if (path && isPersistenceImport(path)) {
            offenders.push({ file, line: index + 1, text: text.trim() });
          }
        });
    }

    expect(
      violationReport(
        offenders,
        'controller 直接相依持久層：請改為注入 facade，由 facade 呼叫 use case / service，再經 port 存取資料',
      ),
    ).toBe('');
  });
});
