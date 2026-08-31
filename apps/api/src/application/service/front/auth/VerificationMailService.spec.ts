import { Logger } from '@nestjs/common';
import { VerificationMailService } from './VerificationMailService';
import { getEnv } from '@app/infrastructure/validate-env';
import type { UserTokenPort } from '@app/application/port/out/user/UserTokenPort';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: jest.fn(),
}));

const mockGetEnv = jest.mocked(getEnv);

const USER_ID = '3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31';
const EMAIL = 'user@example.com';
const TOKEN = 'a1b2c3d4e5f6';

const API = 'http://localhost:3000';
const FRONT = 'http://localhost:5174';

const setEnv = (overrides: Record<string, unknown> = {}): void => {
  mockGetEnv.mockReturnValue({
    API_BASE_URL: API,
    APP_FRONT_URL: FRONT,
    EMAIL_VERIFICATION_EXPIRES_IN: 86400,
    ...overrides,
  } as unknown as ReturnType<typeof getEnv>);
};

const makeService = () => {
  const issue = jest.fn().mockResolvedValue(TOKEN);
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const service = new VerificationMailService(
    { issue } as unknown as UserTokenPort,
    { sendMail },
  );
  return { service, issue, sendMail };
};

/** 取出信件 HTML 裡的驗證連結 */
const linkFrom = (sendMail: jest.Mock): string => {
  const html = (sendMail.mock.calls[0]?.[0] as { html: string })?.html ?? '';
  const matched = /href="([^"]+)"/.exec(html);
  return matched?.[1] ?? '';
};

/** 寄信是 fire-and-forget，要讓那條 promise 鏈跑完才讀得到呼叫 */
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

/**
 * 驗證信的連結。
 *
 * **這支測的是「送到系統外面去的字串」——整個測試矩陣缺的那個形狀。**
 * e2e 對 `/api/front/auth/verify-email?token=` 這個**路徑**發請求，
 * 跑的是被測 app 自己的 base URL；而錯的正是 base 本身。
 * 那類測試永遠驗不到這裡，因為它們是「呼叫自己」。
 *
 * 曾經的錯誤是拿 `APP_FRONT_URL`（前台網站根位址）當後端路由的 base，
 * 於是寄出去的連結指向前台網站上不存在的路徑——而它通過了當時 687 個測試。
 */
describe('VerificationMailService 的連結', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEnv();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('⭐ 以 API_BASE_URL 為 base，不是 APP_FRONT_URL', async () => {
    const { service, sendMail } = makeService();

    await service.send(USER_ID, EMAIL);
    await flush();

    const link = linkFrom(sendMail);
    expect(link.startsWith(API)).toBe(true);
    expect(link.startsWith(FRONT)).toBe(false);
  });

  it('⭐ 兩個變數設成不同 origin 時各用各的', async () => {
    setEnv({
      API_BASE_URL: 'https://api.example.com',
      APP_FRONT_URL: 'https://www.example.com',
    });
    const { service, sendMail } = makeService();

    await service.send(USER_ID, EMAIL);
    await flush();

    expect(linkFrom(sendMail)).toBe(
      `https://api.example.com/api/front/auth/verify-email?token=${TOKEN}`,
    );
  });

  it('連結指向後端的驗證路由並帶 token', async () => {
    const { service, sendMail } = makeService();

    await service.send(USER_ID, EMAIL);
    await flush();

    expect(linkFrom(sendMail)).toBe(
      `${API}/api/front/auth/verify-email?token=${TOKEN}`,
    );
  });

  it('base 結尾有斜線時不會出現連續兩個斜線', async () => {
    setEnv({ API_BASE_URL: 'https://api.example.com/' });
    const { service, sendMail } = makeService();

    await service.send(USER_ID, EMAIL);
    await flush();

    expect(linkFrom(sendMail)).not.toContain('//api/front');
  });

  it('token 由 VERIFY_EMAIL 用途簽發', async () => {
    const { service, issue } = makeService();

    await service.send(USER_ID, EMAIL);

    expect(issue).toHaveBeenCalledWith(USER_ID, 'VERIFY_EMAIL', 86400);
  });

  it('寄信失敗不往外拋——註冊本身已經成功了', async () => {
    const { service, sendMail } = makeService();
    sendMail.mockRejectedValue(new Error('smtp down'));

    await expect(service.send(USER_ID, EMAIL)).resolves.toBeUndefined();
    await flush();
  });
});
