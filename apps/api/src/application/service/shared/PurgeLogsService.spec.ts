import { PurgeLogsService } from './PurgeLogsService';
import type { PurgeLogsPort } from '@app/application/port/out/shared/PurgeLogsPort';

describe('PurgeLogsService', () => {
  let port: jest.Mocked<PurgeLogsPort>;
  let service: PurgeLogsService;

  beforeEach(() => {
    port = {
      purgeLogsBefore: jest
        .fn()
        .mockResolvedValue({ systemLogs: 3, authLogs: 2 }),
    };
    service = new PurgeLogsService(port);
  });

  it('以「現在減去保留天數」作為刪除界線', async () => {
    const before = Date.now();
    await service.purge(90);
    const after = Date.now();

    expect(port.purgeLogsBefore).toHaveBeenCalledTimes(1);
    const cutoff = port.purgeLogsBefore.mock.calls[0][0];
    const expectedMin = before - 90 * 86_400_000;
    const expectedMax = after - 90 * 86_400_000;

    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('回傳兩張表各自刪除的筆數', async () => {
    await expect(service.purge(30)).resolves.toEqual({
      systemLogs: 3,
      authLogs: 2,
    });
  });

  // 保留天數若被當成「保留到幾天後」會反過來刪光所有紀錄，界線方向必須釘住
  it('保留天數越大，刪除界線越早', async () => {
    await service.purge(7);
    const shortCutoff = port.purgeLogsBefore.mock.calls[0][0].getTime();

    port.purgeLogsBefore.mockClear();
    await service.purge(365);
    const longCutoff = port.purgeLogsBefore.mock.calls[0][0].getTime();

    expect(longCutoff).toBeLessThan(shortCutoff);
  });
});
