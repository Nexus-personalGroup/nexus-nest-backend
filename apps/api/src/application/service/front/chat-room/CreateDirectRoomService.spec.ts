import { CreateDirectRoomService } from './CreateDirectRoomService';
import { ChatRoomSelfDirectException } from '@app/domain/exception/ChatRoomSelfDirectException';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import type { ChatRoomRepositoryPort } from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import type { LoadUserPort } from '../../../port/out/user/LoadUserPort';

const mockRepo = {
  findOrCreateDirect: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

// 房間的參與者是**前台使用者**，因此檢查的是 users 而非 members
const mockUser = {
  findActiveUserIds: jest.fn(),
} as unknown as jest.Mocked<LoadUserPort>;

const room = {
  id: 'r1',
  roomType: 'DIRECT' as const,
  name: null,
  memberCount: 2,
  createdAt: new Date(0),
};

describe('CreateDirectRoomService', () => {
  let service: CreateDirectRoomService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findActiveUserIds.mockResolvedValue(['b']);
    mockRepo.findOrCreateDirect.mockResolvedValue(room);
    service = new CreateDirectRoomService(mockRepo, mockUser);
  });

  it('以排序後的 directKey 建立房間', async () => {
    await service.execute({ memberId: 'b', targetMemberId: 'a' });
    expect(mockRepo.findOrCreateDirect).toHaveBeenCalledWith(
      expect.objectContaining({ directKey: 'a:b', createdBy: 'b' }),
    );
  });

  // 兩個方向必須落到同一個 directKey，否則 unique index 擋不住重複房間
  it('A→B 與 B→A 產生同一個 directKey', async () => {
    mockUser.findActiveUserIds.mockResolvedValue(['x']);
    await service.execute({ memberId: 'a', targetMemberId: 'b' });
    await service.execute({ memberId: 'b', targetMemberId: 'a' });
    const [first, second] = mockRepo.findOrCreateDirect.mock.calls;
    expect(first[0].directKey).toBe(second[0].directKey);
  });

  it('對自己建立私聊時拋 ChatRoomSelfDirectException', async () => {
    await expect(
      service.execute({ memberId: 'a', targetMemberId: 'a' }),
    ).rejects.toThrow(ChatRoomSelfDirectException);
    expect(mockRepo.findOrCreateDirect).not.toHaveBeenCalled();
  });

  it('對象不存在或已停用時拋 MemberNotFoundException', async () => {
    mockUser.findActiveUserIds.mockResolvedValue([]);
    await expect(
      service.execute({ memberId: 'a', targetMemberId: 'ghost' }),
    ).rejects.toThrow(MemberNotFoundException);
    expect(mockRepo.findOrCreateDirect).not.toHaveBeenCalled();
  });

  // 先查再建的競態正是本設計要避開的；service 不該有「查有沒有」這個步驟
  it('不先查詢既有房間，直接交給 repository 處理唯一性', async () => {
    await service.execute({ memberId: 'a', targetMemberId: 'b' });
    expect(mockRepo.findOrCreateDirect).toHaveBeenCalledTimes(1);
  });
});
