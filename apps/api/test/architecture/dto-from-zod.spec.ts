import {
  collectSourceFiles,
  findViolations,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * Hard Rule：request / query 的型別一律由 Zod schema 推導，不手寫。
 *
 * 手寫型別會與驗證用的 schema 分岔——schema 改了型別沒改（或反之）不會有任何錯誤，
 * 直到執行期才發現「驗證通過但欄位對不上」。`z.infer` 讓兩者永遠是同一份真相。
 *
 * 只檢查「有沒有 z.infer」不夠：一個檔案可以同時有 schema 與手寫 interface，
 * 實際用的是後者。因此兩件事都查。
 */
describe('架構守則：DTO 由 Zod schema 推導', () => {
  // 涵蓋所有接受外部輸入的進入點，不限 HTTP：WebSocket 事件 payload 與
  // request body 的信任等級完全相同，把掃描範圍綁在 web 目錄等於默許 WS 走較寬鬆的標準
  const IN_SIDE_DIRS = ['src/adapter/in/web', 'src/adapter/in/ws'] as const;

  const files = collectSourceFiles([...IN_SIDE_DIRS], {
    exclude: ['.spec.ts'],
  }).filter((f) => /(Request|Query)\.ts$/.test(f));

  it('掃描範圍有效', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(IN_SIDE_DIRS)('%s 有被掃到', (dir) => {
    expect(files.filter((f) => f.startsWith(dir)).length).toBeGreaterThan(0);
  });

  it('每個 DTO 檔都必須以 z.infer 推導型別', () => {
    const offenders: Violation[] = files
      .filter((file) => !/z\.(infer|output)</.test(readSource(file)))
      .map((file) => ({ file, line: 0, text: '沒有 z.infer 推導' }));

    expect(
      violationReport(
        offenders,
        'DTO 型別未由 Zod schema 推導：請寫成 `export type X = z.infer<typeof xSchema>`，讓驗證與型別是同一份真相',
      ),
    ).toBe('');
  });

  it('DTO 檔不得手寫 class / interface 型別宣告', () => {
    const offenders = findViolations(files, /^export\s+(class|interface)\s/);

    expect(
      violationReport(
        offenders,
        'DTO 手寫了型別宣告：請改由 Zod schema 以 z.infer 推導（`export const xSchema` + `export type X = z.infer<typeof xSchema>`）',
      ),
    ).toBe('');
  });
});
