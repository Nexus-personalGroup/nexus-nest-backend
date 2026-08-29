import { _resetEnvForTest, getEnv } from './validate-env';

/**
 * refresh token 的效期預設值。
 *
 * 這條看起來只是一個數字，但它釘住的是一組**綁在一起的決定**：
 * 後台 SPA 把 refresh token 放 `localStorage`，任一處 XSS 都讀得到，
 * 而 refresh 輪替會續命且 `tokenVersion` 不會遞增——被偷一次等於
 * 可自我續期的完整帳號接管，受害者不會察覺。
 *
 * 因此改長之前必須先改儲存方式（`httpOnly` cookie）。
 * 單獨把數字改回去會讓這支測試紅，那正是它存在的理由。
 */
describe('REFRESH_TOKEN_EXPIRES_IN', () => {
  const original = process.env.REFRESH_TOKEN_EXPIRES_IN;

  beforeEach(() => {
    delete process.env.REFRESH_TOKEN_EXPIRES_IN;
    _resetEnvForTest();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REFRESH_TOKEN_EXPIRES_IN;
    } else {
      process.env.REFRESH_TOKEN_EXPIRES_IN = original;
    }
    _resetEnvForTest();
  });

  it('⭐ 未設定時預設 1 天（86400 秒）', () => {
    expect(getEnv().REFRESH_TOKEN_EXPIRES_IN).toBe(86400);
  });

  it('顯式設定優先於預設', () => {
    process.env.REFRESH_TOKEN_EXPIRES_IN = '3600';
    _resetEnvForTest();

    expect(getEnv().REFRESH_TOKEN_EXPIRES_IN).toBe(3600);
  });
});
