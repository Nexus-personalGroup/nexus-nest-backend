import {
  collectSourceFiles,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

const CODES_FILE = 'src/shared/constants/response-codes.ts';

/** 取出 ResponseCodes 物件中宣告的所有 key */
const declaredCodes = (): string[] => {
  const source = readSource(CODES_FILE);
  const body = source.slice(source.indexOf('export const ResponseCodes'));
  return [...body.matchAll(/^\s{2}([A-Z][A-Z_0-9]*):/gm)].map((m) => m[1]);
};

/** 由字元位置換算 1-based 行號 */
const lineOf = (content: string, index: number): number =>
  content.slice(0, index).split('\n').length;

/**
 * Hard Rule：錯誤碼以 ResponseCodes 為單一真相。
 *
 * 「exception 用到不存在的 code」由 TypeScript 免費擋掉（ResponseCodes.FOO 不存在即型別錯誤），
 * 因此這裡檢查型別擋不住的兩件事：
 * 1. 繞過常數直接傳字面值 code —— 型別是 string，寫死也能編譯過
 * 2. 註冊了卻沒人用的死碼 —— 前端與測試會誤以為某個錯誤碼還在服役
 */
describe('架構守則：錯誤碼單一真相', () => {
  const codes = declaredCodes();
  const exceptions = collectSourceFiles(['src/domain/exception'], {
    exclude: ['.spec.ts'],
  });

  it('掃描範圍有效', () => {
    expect(codes.length).toBeGreaterThan(0);
    expect(exceptions.length).toBeGreaterThan(0);
  });

  it('domain exception 不得傳字面值 code', () => {
    const offenders: Violation[] = [];

    for (const file of exceptions) {
      const content = readSource(file);
      for (const match of content.matchAll(/super\(\s*([^,)]+)/g)) {
        const firstArg = match[1].trim();
        // 第一個參數是引號開頭 → 繞過了 ResponseCodes 常數
        if (/^['"`]/.test(firstArg)) {
          offenders.push({
            file,
            line: lineOf(content, match.index),
            text: `super(${firstArg}...`,
          });
        }
      }
    }

    expect(
      violationReport(
        offenders,
        `domain exception 的 code 寫成字面值：請改引用 ${CODES_FILE} 的 ResponseCodes 常數`,
      ),
    ).toBe('');
  });

  it('ResponseCodes 不得有死碼', () => {
    // 把 src 與 test 全文串起來一次搜尋，避免逐 key 重複讀檔
    const usage = collectSourceFiles(['src', 'test'])
      .filter((file) => file !== CODES_FILE)
      .map((file) => readSource(file))
      .join('\n');

    const unused = codes
      .filter((code) => !usage.includes(`ResponseCodes.${code}`))
      .map((code) => ({
        file: CODES_FILE,
        line: 0,
        text: `${code} 沒有任何引用`,
      }));

    expect(
      violationReport(
        unused,
        '以下錯誤碼已註冊但無人使用：請刪除，或補上對應的 domain exception 與測試',
      ),
    ).toBe('');
  });
});
