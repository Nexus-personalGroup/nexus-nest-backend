import { SchedulerRegistry } from '@nestjs/schedule';
import { ChatRetentionScheduler } from './ChatRetentionScheduler';
import { _resetEnvForTest } from '../../../infrastructure/validate-env';
import type { ChatRetentionService } from '@app/application/service/shared/ChatRetentionService';

// 避免真的建立 / 啟動 cron timer 殘留 handle，mock 掉 cron 套件
jest.mock('cron', () => ({
  CronJob: { from: jest.fn(() => ({ start: jest.fn() })) },
}));

describe('ChatRetentionScheduler', () => {
  const makeRegistry = () =>
    ({ addCronJob: jest.fn() }) as unknown as jest.Mocked<SchedulerRegistry>;

  const makeService = () =>
    ({ purge: jest.fn() }) as unknown as jest.Mocked<ChatRetentionService>;

  afterEach(() => {
    delete process.env.CHAT_RETENTION_ENABLED;
    _resetEnvForTest();
  });

  it('預設啟用時註冊 cron', () => {
    const registry = makeRegistry();
    new ChatRetentionScheduler(registry, makeService()).onModuleInit();

    expect(registry.addCronJob).toHaveBeenCalledTimes(1);
  });

  // 無界成長是知情的選擇，不該無聲發生
  it('停用時不註冊 cron', () => {
    process.env.CHAT_RETENTION_ENABLED = 'false';
    _resetEnvForTest();
    const registry = makeRegistry();

    new ChatRetentionScheduler(registry, makeService()).onModuleInit();

    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  // 與日誌保留是兩支獨立的排程：關掉日誌不該連帶關掉稽核
  it('註冊的 cron 名稱與日誌保留不同', () => {
    const registry = makeRegistry();
    new ChatRetentionScheduler(registry, makeService()).onModuleInit();

    const [name] = registry.addCronJob.mock.calls[0] as [string, unknown];
    expect(name).not.toBe('log-retention-purge');
  });
});
