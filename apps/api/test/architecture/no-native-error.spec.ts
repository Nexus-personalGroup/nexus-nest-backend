import {
  collectSourceFiles,
  findViolations,
  violationReport,
  type Violation,
} from './helpers';
import { NATIVE_ERROR_EXEMPTIONS } from './allowlist';

/**
 * Hard Rule：不得以原生 Error 拋出業務錯誤。
 *
 * 原生 Error 會被 GlobalExceptionFilter 當成非預期錯誤，一律回 500 + 通用訊息；
 * 使用者輸入導致的失敗因此拿不到正確的 status 與錯誤碼。業務錯誤一律用
 * DomainException 子類（帶 ResponseCodes 的 code 與語意 kind）或 NestJS HttpException。
 */
describe('架構守則：不得使用原生 Error', () => {
  // 測試檔以 throw new Error 模擬失敗是合法用法，排除
  const files = collectSourceFiles(['src'], { exclude: ['.spec.ts'] });
  const violations = findViolations(files, /throw new Error\(/);

  const isExempt = (violation: Violation): boolean =>
    NATIVE_ERROR_EXEMPTIONS.some(
      (exemption) =>
        exemption.file === violation.file &&
        violation.text.includes(exemption.snippet),
    );

  it('掃描範圍有效', () => {
    // 目錄改名或掃描樣式失效時這裡先紅，否則「0 個違規」會被誤讀成合規
    expect(files.length).toBeGreaterThan(0);
  });

  it('src 內不得出現 throw new Error（豁免清單除外）', () => {
    const offenders = violations.filter((violation) => !isExempt(violation));

    expect(
      violationReport(
        offenders,
        '以下位置使用原生 Error：業務錯誤請改用 DomainException 子類（帶 ResponseCodes 的 code + 語意 kind），框架層錯誤用 NestJS HttpException',
      ),
    ).toBe('');
  });

  it('豁免清單不得有過期項目', () => {
    const expired = NATIVE_ERROR_EXEMPTIONS.filter(
      (exemption) =>
        !violations.some(
          (violation) =>
            violation.file === exemption.file &&
            violation.text.includes(exemption.snippet),
        ),
    ).map((exemption) => ({
      file: exemption.file,
      line: 0,
      text: `豁免項目「${exemption.snippet}」已不存在於原始碼`,
    }));

    expect(
      violationReport(
        expired,
        '以下豁免已過期（對應的違規已修掉）：請從 test/architecture/allowlist.ts 移除，避免白名單無限膨脹',
      ),
    ).toBe('');
  });
});
