import { EnsureRoomMembershipService } from './EnsureRoomMembershipService';
import { ChatRoomNotFoundException } from '../../../domain/exception/ChatRoomNotFoundException';
import type { ChatRoomRepositoryPort } from '../../port/out/chat-room/ChatRoomRepositoryPort';

const mockRepo = {
  isMember: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

describe('EnsureRoomMembershipService', () => {
  let service: EnsureRoomMembershipService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EnsureRoomMembershipService(mockRepo);
  });

  it('是成員時不拋錯', async () => {
    mockRepo.isMember.mockResolvedValue(true);
    await expect(service.execute('m1', 'r1')).resolves.toBeUndefined();
    expect(mockRepo.isMember).toHaveBeenCalledWith('r1', 'm1');
  });

  it('不是成員時拋 ChatRoomNotFoundException', async () => {
    mockRepo.isMember.mockResolvedValue(false);
    await expect(service.execute('m1', 'r1')).rejects.toThrow(
      ChatRoomNotFoundException,
    );
  });

  // 「房間不存在」在 repository 看來同樣是 isMember=false，
  // 兩者必須回同一個錯誤——分開就成了探測房間存在與否的工具
  it('房間不存在與非成員回同一個錯誤', async () => {
    mockRepo.isMember.mockResolvedValue(false);
    const notMember = await service.execute('m1', 'r1').catch((e) => e);
    const noRoom = await service.execute('m1', 'ghost').catch((e) => e);
    expect(notMember.code).toBe(noRoom.code);
  });
});
