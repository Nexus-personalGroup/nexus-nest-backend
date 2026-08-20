import {
  collectSourceFiles,
  importPathOf,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * Hard Rule：後台（admin）與前台（front）互不相依。
 *
 * 兩側的分界不只在 src/modules/，也貫穿 adapter/in/web/ 與 application/service/，
 * 因此以「路徑是否含 /admin/ 或 /front/」判定所屬側，而非列舉固定目錄 ——
 * 新增分側目錄時不必回頭改這條規則。共用邏輯應下沉到 application / domain / shared。
 */
describe('架構守則：前後台模組隔離', () => {
  const files = collectSourceFiles(['src'], { exclude: ['.spec.ts'] });

  const sideOf = (path: string): 'admin' | 'front' | null => {
    if (path.includes('/admin/')) return 'admin';
    if (path.includes('/front/')) return 'front';
    return null;
  };

  const sided = files.filter((file) => sideOf(file) !== null);

  it('掃描範圍有效', () => {
    // 兩側都必須掃到檔案，否則代表判定方式已與目錄結構脫節
    expect(files.filter((f) => sideOf(f) === 'admin').length).toBeGreaterThan(
      0,
    );
    expect(files.filter((f) => sideOf(f) === 'front').length).toBeGreaterThan(
      0,
    );
  });

  it('admin 與 front 不得互相 import', () => {
    const offenders: Violation[] = [];

    for (const file of sided) {
      const side = sideOf(file);
      const opposite = side === 'admin' ? 'front' : 'admin';

      readSource(file)
        .split('\n')
        .forEach((text, index) => {
          const path = importPathOf(text);
          if (!path) return;
          if (
            path.includes(`/${opposite}/`) ||
            path.startsWith(`${opposite}/`)
          ) {
            offenders.push({ file, line: index + 1, text: text.trim() });
          }
        });
    }

    expect(
      violationReport(
        offenders,
        '前後台互相 import：共用邏輯請下沉到 application / domain / shared，兩側各自引用下層',
      ),
    ).toBe('');
  });
});
