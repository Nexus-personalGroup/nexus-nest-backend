import { CreateGroupRoomService } from './CreateGroupRoomService';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import type { ChatRoomRepositoryPort } from '../../../port/out/chat-room/ChatRoomRepositoryPort';
import type { LoadUserPort } from '../../../port/out/user/LoadUserPort';

const mockRepo = {
  createGroup: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

// 房間的參與者是**前台使用者**，因此檢查的是 users 而非 members
const mockUser = {
  findActiveUserIds: jest.fn(),
} as unknown as jest.Mocked<LoadUserPort>;

describe('CreateGroupRoomService', () => {
  let service: CreateGroupRoomService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.createGroup.mockResolvedValue({
      id: 'r1',
      roomType: 'GROUP',
      name: '專案討論',
      memberCount: 3,
      createdAt: new Date(0),
    });
    service = new CreateGroupRoomService(mockRepo, mockUser);
  });

  it('建立群組並帶入邀請名單', async () => {
    mockUser.findActiveUserIds.mockResolvedValue(['b', 'c']);
    await service.execute({
      memberId: 'a',
      name: '專案討論',
      memberIds: ['b', 'c'],
    });
    expect(mockRepo.createGroup).toHaveBeenCalledWith({
      name: '專案討論',
      memberIds: ['b', 'c'],
      createdBy: 'a',
    });
  });

  // 客戶端把自己也放進名單是常見的，不該因此建出重複的成員關係（複合主鍵會直接衝突）
  it('名單含建立者自己時排除', async () => {
    mockUser.findActiveUserIds.mockResolvedValue(['b']);
    await service.execute({ memberId: 'a', name: 'g', memberIds: ['a', 'b'] });
    expect(mockRepo.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({ memberIds: ['b'] }),
    );
  });

  it('名單重複時去重', async () => {
    mockUser.findActiveUserIds.mockResolvedValue(['b']);
    await service.execute({ memberId: 'a', name: 'g', memberIds: ['b', 'b'] });
    expect(mockRepo.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({ memberIds: ['b'] }),
    );
  });

  // 部分成功會讓呼叫端以為所有人都加入了，而且沒有任何徵兆
  it('名單中有不存在或已停用者時整批失敗', async () => {
    mockUser.findActiveUserIds.mockResolvedValue(['b']);
    await expect(
      service.execute({ memberId: 'a', name: 'g', memberIds: ['b', 'ghost'] }),
    ).rejects.toThrow(MemberNotFoundException);
    expect(mockRepo.createGroup).not.toHaveBeenCalled();
  });
});
