import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PresenceSweepScheduler } from './PresenceSweepScheduler';
import { PresencePort } from '@app/application/port/out/presence/PresencePort';

// 避免真的建立 / 啟動 cron timer 殘留 handle（會讓 jest 卡住不結束）
jest.mock('cron', () => ({
  CronJob: { from: jest.fn(() => ({ start: jest.fn() })) },
}));

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    WS_HEARTBEAT_INTERVAL: 15,
    APP_TIMEZONE: 'Asia/Taipei',
  }),
}));

const makePresence = (): jest.Mocked<PresencePort> => ({
  markOnline: jest.fn(),
  markOffline: jest.fn(),
  heartbeat: jest.fn(),
  isOnline: jest.fn(),
  getConnections: jest.fn(),
  sweepStale: jest.fn().mockResolvedValue(0),
});

/** 取出傳給 CronJob.from 的設定，用來檢查 cron 表達式與直接觸發 onTick */
const cronConfig = (): { cronTime: string; onTick: () => void } =>
  (CronJob.from as jest.Mock).mock.calls[0][0] as {
    cronTime: string;
    onTick: () => void;
  };

describe('PresenceSweepScheduler', () => {
  const registry = { addCronJob: jest.fn() } as unknown as SchedulerRegistry;

  beforeEach(() => jest.clearAllMocks());

  it('cron 週期是心跳間隔的兩倍', () => {
    new PresenceSweepScheduler(registry, makePresence()).onModuleInit();

    // 比陳舊門檻（心跳 × 倍數）密集才不會讓垃圾累積，
    // 又不必每個心跳週期都掃一次全庫
    expect(cronConfig().cronTime).toBe('*/30 * * * * *');
    expect(registry.addCronJob).toHaveBeenCalledTimes(1);
  });

  it('排程觸發時呼叫 sweepStale', async () => {
    const presence = makePresence();
    new PresenceSweepScheduler(registry, presence).onModuleInit();

    cronConfig().onTick();
    await new Promise((r) => setImmediate(r));

    expect(presence.sweepStale).toHaveBeenCalled();
  });

  // Redis 不可用時 presence 會拋。清理失敗不影響服務，但例外若逃出去
  // 會變成未處理的 rejection 並終止整個行程——那遠比「這次沒清到」嚴重
  it('sweepStale 拋錯時吞掉並記錄，不讓例外逃出去', async () => {
    const presence = makePresence();
    presence.sweepStale.mockRejectedValue(new Error('Redis 不可用'));
    new PresenceSweepScheduler(registry, presence).onModuleInit();

    expect(() => cronConfig().onTick()).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(presence.sweepStale).toHaveBeenCalled();
  });
});
