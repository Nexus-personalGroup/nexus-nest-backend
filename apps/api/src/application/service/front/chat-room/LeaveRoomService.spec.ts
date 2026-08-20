import { LeaveRoomService } from './LeaveRoomService';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import { SERVER_EVENTS } from '../../../port/out/server-events';
import type { ChatRoomRepositoryPort } from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import type { EventPublisherPort } from '../../../port/out/EventPublisherPort';

const mockRepo = {
  removeMember: jest.fn(),
  countMembers: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

const mockPublisher = {
  publishToRoom: jest.fn(),
  publishToMember: jest.fn(),
} as unknown as jest.Mocked<EventPublisherPort>;

describe('LeaveRoomService', () => {
  let service: LeaveRoomService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.removeMember.mockResolvedValue(true);
    mockRepo.countMembers.mockResolvedValue(2);
    service = new LeaveRoomService(mockRepo, mockPublisher);
  });

  it('移除成員關係', async () => {
    await service.execute({ roomId: 'r1', memberId: 'm1' });
    expect(mockRepo.removeMember).toHaveBeenCalledWith('r1', 'm1');
  });

  it('通知房間其餘成員，附上更新後的人數', async () => {
    await service.execute({ roomId: 'r1', memberId: 'm1' });
    expect(mockPublisher.publishToRoom).toHaveBeenCalledWith(
      'r1',
      SERVER_EVENTS.ROOM_MEMBER_CHANGED,
      { roomId: 'r1', memberId: 'm1', action: 'LEFT', memberCount: 2 },
    );
  });

  // 非成員與房間不存在都會讓 removeMember 回 false，兩者刻意共用同一個錯誤
  it('本來就不是成員時拋 ChatRoomNotFoundException', async () => {
    mockRepo.removeMember.mockResolvedValue(false);
    await expect(
      service.execute({ roomId: 'r1', memberId: 'stranger' }),
    ).rejects.toThrow(ChatRoomNotFoundException);
  });

  // 沒移除卻推播，等於把「某人離開了」廣播給根本沒變動的房間
  it('未實際移除時不推播', async () => {
    mockRepo.removeMember.mockResolvedValue(false);
    await service
      .execute({ roomId: 'r1', memberId: 'x' })
      .catch(() => undefined);
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });
});
