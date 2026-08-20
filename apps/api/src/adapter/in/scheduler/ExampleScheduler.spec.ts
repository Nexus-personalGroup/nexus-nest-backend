import { SchedulerRegistry } from '@nestjs/schedule';
import { ExampleScheduler } from './ExampleScheduler';
import { _resetEnvForTest } from '../../../infrastructure/validate-env';

// 避免真的建立 / 啟動 cron timer 殘留 handle，mock 掉 cron 套件
jest.mock('cron', () => ({
  CronJob: { from: jest.fn(() => ({ start: jest.fn() })) },
}));

describe('ExampleScheduler', () => {
  const makeRegistry = () =>
    ({ addCronJob: jest.fn() }) as unknown as jest.Mocked<SchedulerRegistry>;

  afterEach(() => {
    delete process.env.SCHEDULE_ENABLED;
    _resetEnvForTest();
  });

  it('SCHEDULE_ENABLED=false 時不註冊 cron', () => {
    process.env.SCHEDULE_ENABLED = 'false';
    _resetEnvForTest();
    const registry = makeRegistry();

    new ExampleScheduler(registry).onModuleInit();

    expect(registry.addCronJob).not.toHaveBeenCalled();
  });

  it('SCHEDULE_ENABLED=true 時以排程名稱註冊 cron', () => {
    process.env.SCHEDULE_ENABLED = 'true';
    _resetEnvForTest();
    const registry = makeRegistry();

    new ExampleScheduler(registry).onModuleInit();

    expect(registry.addCronJob).toHaveBeenCalledWith(
      'example-heartbeat',
      expect.anything(),
    );
  });
});
