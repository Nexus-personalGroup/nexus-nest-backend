import { collectSourceFiles, readSource, violationReport } from './helpers';
import { ENV_EXEMPT_NAMES } from './allowlist';

const ENV_FILE = 'src/infrastructure/validate-env.ts';

/** 取出 envSchema = z.object({ ... }) 區塊中宣告的環境變數名稱 */
const declaredEnvKeys = (): string[] => {
  const source = readSource(ENV_FILE);
  const start = source.indexOf('const envSchema = z.object({');
  const body = source.slice(start, source.indexOf('\n});', start));
  return [...body.matchAll(/^\s{2}([A-Z][A-Z_0-9]*):/gm)].map((m) => m[1]);
};

/**
 * Hard Rule：任何環境變數都必須經過 envSchema 驗證。
 *
 * 漏宣告不會有錯誤訊息，只會在執行期靜默變成 undefined —— 對「是否啟用某項防護」
 * 這類旗標而言，靜默的 undefined 等於預設關閉，是最難察覺的一種失效。
 */
describe('架構守則：環境變數必須宣告於 envSchema', () => {
  const declared = declaredEnvKeys();
  const files = collectSourceFiles(['src', 'scripts', 'seeds'], {
    exclude: ['.spec.ts'],
  });

  const used = new Map<string, { file: string; line: number }>();
  for (const file of files) {
    readSource(file)
      .split('\n')
      .forEach((text, index) => {
        for (const match of text.matchAll(/process\.env\.([A-Z][A-Z_0-9]*)/g)) {
          if (!used.has(match[1])) {
            used.set(match[1], { file, line: index + 1 });
          }
        }
      });
  }

  it('掃描範圍有效', () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(used.size).toBeGreaterThan(0);
  });

  it('使用到的 process.env 都必須宣告於 envSchema', () => {
    const undeclared = [...used.entries()]
      .filter(
        ([name]) =>
          !declared.includes(name) && !ENV_EXEMPT_NAMES.includes(name),
      )
      .map(([name, at]) => ({
        file: at.file,
        line: at.line,
        text: `${name} 未宣告於 envSchema`,
      }));

    expect(
      violationReport(
        undeclared,
        `以下環境變數未經驗證，執行期會靜默成 undefined：請加入 ${ENV_FILE} 的 envSchema（正式環境必填者一併加進 productionErrors）`,
      ),
    ).toBe('');
  });

  it('env 豁免清單不得有過期項目', () => {
    const expired = ENV_EXEMPT_NAMES.filter(
      (name) => declared.includes(name) || !used.has(name),
    ).map((name) => ({
      file: 'test/architecture/allowlist.ts',
      line: 0,
      text: `${name} 已宣告或已不再使用`,
    }));

    expect(
      violationReport(
        expired,
        '以下 env 豁免已過期：請從 test/architecture/allowlist.ts 的 TEMPORARY_ENV 移除',
      ),
    ).toBe('');
  });
});
