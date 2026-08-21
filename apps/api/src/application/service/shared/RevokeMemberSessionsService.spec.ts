import { RevokeMemberSessionsService } from './RevokeMemberSessionsService';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import type { EventPublisherPort } from '@app/application/port/out/EventPublisherPort';

const calls: string[] = [];

const mockPublisher = {
  publishToRoom: jest.fn(),
  publishToMember: jest.fn(() => {
    calls.push('publish');
  }),
  disconnectMember: jest.fn(() => {
    calls.push('disconnect');
    return Promise.resolve();
  }),
} as unknown as jest.Mocked<EventPublisherPort>;

describe('RevokeMemberSessionsService', () => {
  let service: RevokeMemberSessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    service = new RevokeMemberSessionsService(mockPublisher);
  });

  it('送出 sessionRevoked 並斷開連線', async () => {
    await service.execute('m1');

    expect(mockPublisher.publishToMember).toHaveBeenCalledWith(
      'm1',
      SERVER_EVENTS.SESSION_REVOKED,
      expect.objectContaining({ reason: 'ACCOUNT_DISABLED' }),
    );
    expect(mockPublisher.disconnectMember).toHaveBeenCalledWith('m1');
  });

  /**
   * 順序不可顛倒——斷線後就沒有管道可以說明原因了。
   *
   * 沒有那個事件，Socket.IO 的客戶端會自動重連並在 handshake 被拒，
   * 進入無盡的重連迴圈，而使用者看到的是「一直在連線中」。
   */
  it('⭐ 先送事件，再斷線', async () => {
    await service.execute('m1');

    expect(calls).toEqual(['publish', 'disconnect']);
  });

  it('payload 不含任何敏感資訊', async () => {
    await service.execute('m1');

    const [, , payload] = mockPublisher.publishToMember.mock.calls[0];
    expect(Object.keys(payload as object).sort()).toEqual([
      'reason',
      'revokedAt',
    ]);
  });
});
