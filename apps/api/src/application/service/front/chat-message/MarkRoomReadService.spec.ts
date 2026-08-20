import { MarkRoomReadService } from './MarkRoomReadService';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import type { EnsureRoomMembershipUseCase } from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import type { ChatRoomRepositoryPort } from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import type { ChatRoomReadRepositoryPort } from '@app/application/port/out/chat-message/ChatRoomReadRepositoryPort';
import type { EventPublisherPort } from '@app/application/port/out/EventPublisherPort';

const mockMembership = {
  execute: jest.fn(),
} as unknown as jest.Mocked<EnsureRoomMembershipUseCase>;

const mockRoomRepo = {
  getLastSeq: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

const mockReadRepo = {
  markRead: jest.fn(),
} as unknown as jest.Mocked<ChatRoomReadRepositoryPort>;

const mockPublisher = {
  publishToRoom: jest.fn(),
  publishToMember: jest.fn(),
} as unknown as jest.Mocked<EventPublisherPort>;

const command = { roomId: 'room-1', memberId: 'me', lastReadSeq: 42 };

describe('MarkRoomReadService', () => {
  let service: MarkRoomReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.execute.mockResolvedValue(undefined);
    mockRoomRepo.getLastSeq.mockResolvedValue(100);
    mockReadRepo.markRead.mockResolvedValue(true);
    service = new MarkRoomReadService(
      mockMembership,
      mockRoomRepo,
      mockReadRepo,
      mockPublisher,
    );
  });

  it('非成員無法更新已讀', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());
    await expect(service.execute(command)).rejects.toThrow(
      ChatRoomNotFoundException,
    );
    expect(mockReadRepo.markRead).not.toHaveBeenCalled();
  });

  it('前進時更新並推播給房間', async () => {
    await service.execute(command);

    expect(mockReadRepo.markRead).toHaveBeenCalledWith('room-1', 'me', 42);
    expect(mockPublisher.publishToRoom).toHaveBeenCalledWith(
      'room-1',
      SERVER_EVENTS.ROOM_READ,
      { roomId: 'room-1', memberId: 'me', lastReadSeq: 42 },
    );
  });

  // 往回捲不是事件；推播只會讓其他人的畫面無謂重繪
  it('沒有前進時不推播', async () => {
    mockReadRepo.markRead.mockResolvedValue(false);
    await service.execute(command);
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });

  // 允許的話，那些訊息之後真的送出時會一出生就是已讀
  it('超過房間最新 seq 時夾住', async () => {
    mockRoomRepo.getLastSeq.mockResolvedValue(10);
    await service.execute(command);
    expect(mockReadRepo.markRead).toHaveBeenCalledWith('room-1', 'me', 10);
  });

  it('房間沒有任何訊息時夾到 0', async () => {
    mockRoomRepo.getLastSeq.mockResolvedValue(0);
    await service.execute(command);
    expect(mockReadRepo.markRead).toHaveBeenCalledWith('room-1', 'me', 0);
  });
});
