import { GetDashboardSnapshotService } from './GetDashboardSnapshotService';
import { CHAT_AUDIT_PORT } from '@app/application/port/out/ChatAuditPort';
import type { PresencePort } from '@app/application/port/out/presence/PresencePort';
import type { ChatReportRepositoryPort } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatRoomRepositoryPort } from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import type { LoadMemberPort } from '@app/application/port/out/member/LoadMemberPort';
import type { ChatMessageRepositoryPort } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

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
  countMembers: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;
const messageRepo = {
  countSince: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

describe('GetDashboardSnapshotService', () => {
  let service: GetDashboardSnapshotService;

  beforeEach(() => {
    jest.clearAllMocks();
    presence.countOnlineMembers.mockResolvedValue(0);
    reportRepo.countByStatus.mockResolvedValue(0);
    roomRepo.countRooms.mockResolvedValue(0);
    memberRepo.countMembers.mockResolvedValue(0);
    messageRepo.countSince.mockResolvedValue(0);
    service = new GetDashboardSnapshotService(
      presence,
      reportRepo,
      roomRepo,
      memberRepo,
      messageRepo,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('回傳五個數字與 generatedAt', async () => {
    presence.countOnlineMembers.mockResolvedValue(12);
    reportRepo.countByStatus.mockResolvedValue(3);
    roomRepo.countRooms.mockResolvedValue(48);
    memberRepo.countMembers.mockResolvedValue(156);
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
