import { GetDashboardSnapshotService } from './GetDashboardSnapshotService';
import { CHAT_AUDIT_PORT } from '@app/application/port/out/ChatAuditPort';
import type { PresencePort } from '@app/application/port/out/presence/PresencePort';
import type { ChatReportRepositoryPort } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatRoomRepositoryPort } from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import type { LoadUserPort } from '@app/application/port/out/user/LoadUserPort';
import type { ChatMessageRepositoryPort } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import type { MetricsPort } from '@app/application/port/out/MetricsPort';

jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({ APP_TIMEZONE: 'Asia/Taipei' }),
}));

const presence = {
  countOnlineMembers: jest.fn(),
} as unknown as jest.Mocked<PresencePort>;
const reportRepo = {
  countByStatus: jest.fn(),
} as unknown as jest.Mocked<ChatReportRepositoryPort>;
const roomRepo = {
  countRooms: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;
const memberRepo = {
  countUsers: jest.fn(),
} as unknown as jest.Mocked<LoadUserPort>;
const messageRepo = {
  countSince: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;
const metrics = {
  observeDashboardQuerySeconds: jest.fn(),
} as unknown as jest.Mocked<MetricsPort>;

describe('GetDashboardSnapshotService', () => {
  let service: GetDashboardSnapshotService;

  beforeEach(() => {
    jest.clearAllMocks();
    presence.countOnlineMembers.mockResolvedValue(0);
    reportRepo.countByStatus.mockResolvedValue(0);
    roomRepo.countRooms.mockResolvedValue(0);
    memberRepo.countUsers.mockResolvedValue(0);
    messageRepo.countSince.mockResolvedValue(0);
    service = new GetDashboardSnapshotService(
      presence,
      reportRepo,
      roomRepo,
      memberRepo,
      messageRepo,
      metrics,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('回傳五個數字與 generatedAt', async () => {
    presence.countOnlineMembers.mockResolvedValue(12);
    reportRepo.countByStatus.mockResolvedValue(3);
    roomRepo.countRooms.mockResolvedValue(48);
    memberRepo.countUsers.mockResolvedValue(156);
    messageRepo.countSince.mockResolvedValue(1204);

    const result = await service.execute();

    expect(result).toEqual(
      expect.objectContaining({
        onlineMembers: 12,
        pendingReports: 3,
        totalRooms: 48,
        totalMembers: 156,
        messagesToday: 1204,
      }),
    );
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('只算待處理的檢舉', async () => {
    await service.execute();

    expect(reportRepo.countByStatus).toHaveBeenCalledWith('PENDING');
  });

  it('空資料庫 → 全部為 0', async () => {
    const result = await service.execute();

    expect(result.onlineMembers).toBe(0);
    expect(result.messagesToday).toBe(0);
  });

  /**
   * 日界依 `APP_TIMEZONE` 而非 UTC。
   *
   * 用 UTC 的話「今日訊息數」會在**台灣時間早上八點**莫名其妙歸零——
   * 而那種錯誤只在特定時段出現，很難被回報，也很難重現。
   */
  it('⭐ 今日的起點用 APP_TIMEZONE 的午夜，不是 UTC 午夜', async () => {
    jest.useFakeTimers();
    // 台北 2026-08-22 03:00 = UTC 2026-08-21 19:00
    jest.setSystemTime(new Date('2026-08-21T19:00:00.000Z'));

    await service.execute();

    const since: Date = messageRepo.countSince.mock.calls[0][0];
    // 台北 2026-08-22 00:00 = UTC 2026-08-21 16:00
    expect(since.toISOString()).toBe('2026-08-21T16:00:00.000Z');
  });

  describe('查詢成本的量測', () => {
    /**
     * 逐個查詢量測，不是量整份快照。
     *
     * 總耗時說得出「慢」，說不出「該修哪一個」——而修法的三個選項
     * （加索引 / 改寫查詢 / 快取整份快照）代價各不相同。
     */
    it('⭐ 五個查詢各自回報一次，且查詢名正確', async () => {
      await service.execute();

      const reported = metrics.observeDashboardQuerySeconds.mock.calls.map(
        (call) => call[0],
      );

      expect(reported).toHaveLength(5);
      expect(reported.sort()).toEqual(
        [
          'messages-today',
          'online-members',
          'pending-reports',
          'total-members',
          'total-rooms',
        ].sort(),
      );
    });

    it('耗時以秒為單位回報', async () => {
      await service.execute();

      for (const [, seconds] of metrics.observeDashboardQuerySeconds.mock
        .calls) {
        expect(typeof seconds).toBe('number');
        // 毫秒除以 1000：mock 立即回覆，所以應該遠小於 1 秒
        expect(seconds).toBeLessThan(1);
        expect(seconds).toBeGreaterThanOrEqual(0);
      }
    });

    /**
     * 失敗的查詢不記錄耗時。
     *
     * 跑到一半就拋出的查詢，它的數字不代表「這個查詢多久」，
     * 混進直方圖只會讓分位數失真。
     */
    it('⭐ 某個查詢拋錯 → 該查詢不回報，其餘不受影響', async () => {
      roomRepo.countRooms.mockRejectedValue(new Error('boom'));

      await expect(service.execute()).rejects.toThrow('boom');

      const reported = metrics.observeDashboardQuerySeconds.mock.calls.map(
        (call) => call[0],
      );
      expect(reported).not.toContain('total-rooms');
      // 其餘四個仍各自量測——Promise.all 的併發沒有被量測包裝破壞
      expect(reported).toHaveLength(4);
    });
  });

  // 回應只有聚合數字，不含任何個人或訊息內容
  it('沒有注入稽核 port（快照不可能寫稽核）', () => {
    const injected: unknown = Reflect.getMetadata(
      'self:paramtypes',
      GetDashboardSnapshotService,
    );
    const tokens = Array.isArray(injected)
      ? injected.map((dep: { param: unknown }) => dep.param)
      : [];

    expect(tokens).not.toContain(CHAT_AUDIT_PORT);
  });
});
