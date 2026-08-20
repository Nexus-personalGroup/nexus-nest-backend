import {
  collectSourceFiles,
  readSource,
  violationReport,
  type Violation,
} from './helpers';

/**
 * 錯誤文案一律取自 response-messages.ts，exception 不得內嵌字面值。
 *
 * 訊息表建立後最容易腐化的方式，是有人為了「只是加一個小 exception」又把文案寫回
 * constructor —— 一旦開始，集中管理就名存實亡。以「字串字面值中出現中文字元」為判準：
 * exception 檔案的程式碼本體只有 code、kind 與 import，不存在合法的中文字串。
 */
describe('架構守則：exception 不得內嵌文案', () => {
  const files = collectSourceFiles(['src/domain/exception'], {
    exclude: ['.spec.ts'],
  });

  // TSDoc 註解含 markdown 反引號（如 `code`），直接比對「引號 + 中文」會把註解誤判成字串
  const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

  it('掃描範圍有效', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('exception 內不得出現中文字串字面值', () => {
    const offenders: Violation[] = [];

    for (const file of files) {
      readSource(file)
        .split('\n')
        .forEach((text, index) => {
          if (isComment(text)) return;
          if (/['"`][^'"`]*[一-鿿]/.test(text)) {
            offenders.push({ file, line: index + 1, text: text.trim() });
          }
        });
    }

    expect(
      violationReport(
        offenders,
        '以下 exception 內嵌了中文文案：請改為在 shared/constants/response-messages.ts 定義，靜態訊息只需 super(code, kind)',
      ),
    ).toBe('');
  });
});
