import { Logger } from '@nestjs/common';
import { IpWhitelistBootstrapCheck } from './IpWhitelistBootstrapCheck';
import type { IpListPort } from '@app/application/port/out/security/IpListPort';
import type { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

const ipList = {
  listWhitelist: jest.fn(),
} as unknown as jest.Mocked<IpListPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

const withTotal = (total: number) => ({ list: [], total });

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('IpWhitelistBootstrapCheck', () => {
  it('⭐ 啟用且清單為空 → 記一筆 error，說明後果與恢復方式', async () => {
    (ipList.listWhitelist as jest.Mock).mockResolvedValue(withTotal(0));
    const check = new IpWhitelistBootstrapCheck(makeFlags(true), ipList);

    await check.onApplicationBootstrap();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    // 訊息要說得出「會怎樣」與「怎麼救」，只寫「白名單是空的」沒有用
    expect(message).toContain('403');
    expect(message).toContain('APPLICATION_IP_WHITELIST_ENABLED');
    expect(message).toContain('ip:allow');
  });

  it('啟用且清單非空 → 不記錄', async () => {
    (ipList.listWhitelist as jest.Mock).mockResolvedValue(withTotal(3));
    const check = new IpWhitelistBootstrapCheck(makeFlags(true), ipList);

    await check.onApplicationBootstrap();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  /**
   * 功能關閉時連查都不查。
   *
   * 缺這一態的話，「一律查清單」的實作也會全綠——
   * 而那會讓每次啟動都多一次沒有意義的資料庫往返，
   * 且在白名單功能關閉時「清單為空」是完全正常的狀態。
   */
  it('⭐ 功能關閉 → 完全不查清單，也不記錄', async () => {
    const check = new IpWhitelistBootstrapCheck(makeFlags(false), ipList);

    await check.onApplicationBootstrap();

    expect(ipList.listWhitelist).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('只取一筆就夠——要的是 total 不是內容', async () => {
    (ipList.listWhitelist as jest.Mock).mockResolvedValue(withTotal(1));
    const check = new IpWhitelistBootstrapCheck(makeFlags(true), ipList);

    await check.onApplicationBootstrap();

    expect(ipList.listWhitelist).toHaveBeenCalledWith({ page: 1, limit: 1 });
  });
});
