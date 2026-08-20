import {
  collectSourceFiles,
  importPathOf,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/** in 側的進入點類型。新增類型時必須加進這裡，否則它會落在守則的掃描範圍外 */
const ENTRY_POINT_SUFFIXES = ['Controller.ts', 'Gateway.ts'] as const;

/**
 * Hard Rule：in 側的進入點不得直接相依持久層。
 *
 * 分層是 Facade → UseCase / Service → Port，進入點只認 facade 與 DTO。
 * 一旦進入點直接注入 Prisma 或 repository，六角架構的內外隔離就被穿透，
 * 之後替換持久層或寫服務層測試都會被綁死在 ORM 上。
 *
 * **涵蓋所有進入點類型，不限 Controller。** 本規則原本只 filter `*Controller.ts`，
 * 導致新增的 WebSocket gateway 完全落在掃描範圍外——規則存在、正確，但看不到它。
 * 前一版專案的 gateway 長到 544 行、業務邏輯與持久層呼叫混在一起，
 * 正是因為當時沒有任何檢查會擋下第一次違規。
 */
describe('架構守則：in 側進入點不得相依持久層', () => {
  // 命名慣例為 PascalCase 的 XxxController.ts / XxxGateway.ts（非 xxx.controller.ts）
  const entryPoints = collectSourceFiles(['src/adapter/in'], {
    exclude: ['.spec.ts'],
  }).filter((file) => ENTRY_POINT_SUFFIXES.some((s) => file.endsWith(s)));

  const isPersistenceImport = (path: string): boolean =>
    /PrismaService|PrismaClient|prisma\.service|adapter\/out\/persistence/.test(
      path,
    ) || /Repository$/.test(path);

  it('掃描範圍有效', () => {
    expect(entryPoints.length).toBeGreaterThan(0);
  });

  // 每一種進入點類型都必須實際掃到檔案。只檢查總數的話，
  // 某一類全部落在範圍外時仍會通過——那正是本規則先前的失效方式
  it.each(ENTRY_POINT_SUFFIXES)('%s 類型有被掃到', (suffix) => {
    expect(
      entryPoints.filter((f) => f.endsWith(suffix)).length,
    ).toBeGreaterThan(0);
  });

  it('進入點不得 import Prisma 或 repository', () => {
    const offenders: Violation[] = [];

    for (const file of entryPoints) {
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
        '進入點直接相依持久層：請改為注入 facade，由 facade 呼叫 use case / service，再經 port 存取資料',
      ),
    ).toBe('');
  });
});
