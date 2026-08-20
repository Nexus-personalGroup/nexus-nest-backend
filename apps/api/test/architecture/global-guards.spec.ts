import { readSource } from './helpers';

/**
 * 認證與授權 guard 必須全域註冊，且順序正確。
 *
 * 授權曾經只靠各 controller 自己 `@UseGuards(PermissionsGuard)`——漏掛的後果是
 * **沉默的授權繞過**：`@Permissions(...)` 退化成純註解，端點對任何已登入者開放，
 * 沒有錯誤訊息、測試照樣綠燈。改成全域註冊後這類 bug 不可能發生，
 * 但代價是「全域註冊」本身成了單點：有人把它從 providers 拿掉，
 * 所有權限裝飾器會同時失效，同樣沒有任何徵兆。
 *
 * 順序也要守：`RolesGuard` 與 `PermissionsGuard` 都讀 `request.member`，
 * 那是 `JwtAuthGuard` 填的。排在它前面會拿到 undefined，變成靜默放行。
 */
describe('架構守則：認證與授權 guard 全域註冊', () => {
  const source = readSource('src/app.module.ts');

  /** 取出 APP_GUARD 的註冊順序 */
  const registered = (): string[] =>
    [...source.matchAll(/provide:\s*APP_GUARD\s*,\s*useClass:\s*(\w+)/g)].map(
      (m) => m[1],
    );

  it('掃描範圍有效', () => {
    expect(registered().length).toBeGreaterThan(0);
  });

  it('三個 guard 都必須全域註冊', () => {
    const guards = registered();
    const required = ['JwtAuthGuard', 'RolesGuard', 'PermissionsGuard'];
    const missing = required.filter((g) => !guards.includes(g));

    expect(
      missing.length === 0
        ? ''
        : `以下 guard 未以 APP_GUARD 全域註冊：\n${missing
            .map((g) => `  ${g}`)
            .join(
              '\n',
            )}\n少了授權 guard 會讓 @Permissions / @Roles 退化成純註解——端點對任何已登入者開放，且沒有任何錯誤訊息`,
    ).toBe('');
  });

  it('授權 guard 必須排在 JwtAuthGuard 之後', () => {
    const guards = registered();
    const authIndex = guards.indexOf('JwtAuthGuard');
    expect(authIndex).toBeGreaterThanOrEqual(0);

    const tooEarly = ['RolesGuard', 'PermissionsGuard'].filter((g) => {
      const index = guards.indexOf(g);
      return index >= 0 && index < authIndex;
    });

    expect(
      tooEarly.length === 0
        ? ''
        : `以下 guard 排在 JwtAuthGuard 之前：\n${tooEarly
            .map((g) => `  ${g}`)
            .join(
              '\n',
            )}\n它們讀的 request.member 由 JwtAuthGuard 填入，排前面會拿到 undefined 而靜默放行。\nAPP_GUARD 的宣告順序即執行順序。`,
    ).toBe('');
  });
});
