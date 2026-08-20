import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { LoggingInterceptor } from './LoggingInterceptor';
import { SaveSystemLogPort } from '@app/application/port/out/shared/SaveSystemLogPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({ REDIS_KEY_PREFIX: 'test:', SERVICE_NAME: 'test' }),
}));

const makeContext = (): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        originalUrl: '/api/members',
        url: '/api/members',
        headers: {},
        body: {},
        query: {},
        ip: '9.9.9.9',
      }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  }) as unknown as ExecutionContext;

const makeHandler = (): CallHandler => ({ handle: () => of('result') });

const mockSaveSystemLog = {
  saveSystemLog: jest.fn().mockResolvedValue(undefined),
} as jest.Mocked<SaveSystemLogPort>;

const makeFlags = (enabled: boolean) =>
  ({ isEnabled: jest.fn(() => enabled) }) as unknown as FeatureFlagService;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoggingInterceptor', () => {
  it('apiLog 開啟 → 寫入 system log，且原樣傳遞回應', async () => {
    const interceptor = new LoggingInterceptor(
      mockSaveSystemLog,
      makeFlags(true),
    );

    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler()),
    );

    expect(result).toBe('result');
    expect(mockSaveSystemLog.saveSystemLog).toHaveBeenCalledTimes(1);
  });

  it('apiLog 關閉 → 不寫 system log，仍傳遞回應', async () => {
    const interceptor = new LoggingInterceptor(
      mockSaveSystemLog,
      makeFlags(false),
    );

    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler()),
    );

    expect(result).toBe('result');
    expect(mockSaveSystemLog.saveSystemLog).not.toHaveBeenCalled();
  });
});
