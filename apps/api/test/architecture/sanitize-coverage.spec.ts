import { sanitize } from '@app/infrastructure/sanitize';
import { collectSourceFiles, readSource } from './helpers';

/**
 * 進得了 request body 的敏感欄位，一定要被 `sanitize()` 遮蔽。
 *
 * 這條規則守的是**未來新增的欄位**——單元測試 `sanitize.spec.ts` 只能列舉當下已知的
 * 欄位名，但真正咬人的是「有人加了新 DTO 欄位，沒人想到它會進 log」。本專案就這樣
 * 漏過 `newPassword`：`reset-password` 的新密碼以明文寫進 `system_logs.request`，
 * 而當時 `sanitize` 的敏感鍵清單是精確比對，`password` 有、`newPassword` 沒有。
 *
 * 作法是掃出所有 request DTO 的欄位名，挑出看起來敏感的，實際餵進 `sanitize()`
 * 驗證真的被遮——用真函式而非重新實作一份判斷，才不會兩邊各自漂移。
 */
describe('架構守則：request DTO 的敏感欄位都被 sanitize 遮蔽', () => {
  /** 判定「這個欄位名看起來裝了不該進 log 的東西」的字根 */
  const SENSITIVE_STEMS = [
    'password',
    'token',
    'secret',
    'credential',
    'apikey',
    'privatekey',
    'authorization',
  ];

  const dtoFiles = collectSourceFiles(['src/adapter/in/web'], {
    exclude: ['.spec.ts'],
  }).filter((f) => f.endsWith('Request.ts'));

  /** 取出 zod schema 中的欄位名：`  fieldName: z.string()` */
  const fieldNames = (): { file: string; field: string }[] => {
    const found: { file: string; field: string }[] = [];
    for (const file of dtoFiles) {
      for (const match of readSource(file).matchAll(
        /^\s{2}([A-Za-z_][\w-]*)\s*:\s*z\./gm,
      )) {
        found.push({ file, field: match[1] });
      }
    }
    return found;
  };

  it('掃描範圍有效', () => {
    expect(dtoFiles.length).toBeGreaterThan(0);
    expect(fieldNames().length).toBeGreaterThan(0);
  });

  it('看起來敏感的 DTO 欄位都必須被遮蔽', () => {
    const sensitive = fieldNames().filter(({ field }) => {
      const normalized = field.toLowerCase().replace(/[_-]/g, '');
      return SENSITIVE_STEMS.some((stem) => normalized.includes(stem));
    });

    // 專案一定有 password / token 類欄位；掃到 0 個代表正規式或路徑失效
    expect(sensitive.length).toBeGreaterThan(0);

    const leaked = sensitive.filter(({ field }) => {
      const output: unknown = JSON.parse(sanitize({ [field]: 'SENTINEL' }));
      return (output as Record<string, unknown>)[field] !== '[REDACTED]';
    });

    expect(
      leaked.length === 0
        ? ''
        : `以下 request DTO 欄位不會被 sanitize 遮蔽，開啟 APPLICATION_API_LOG_ENABLED 後會明文寫進 system_logs：\n${leaked
            .map((l) => `  ${l.file}  欄位 ${l.field}`)
            .join(
              '\n',
            )}\n請到 src/infrastructure/sanitize.ts 的 SENSITIVE_KEY_PATTERNS 補上對應字根`,
    ).toBe('');
  });
});
