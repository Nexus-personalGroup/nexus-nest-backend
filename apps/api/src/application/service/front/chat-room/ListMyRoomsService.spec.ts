import { ListMyRoomsService } from './ListMyRoomsService';
import type { ChatRoomRepositoryPort } from '../../../port/out/chat-room/ChatRoomRepositoryPort';

const mockRepo = {
  listByMember: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

describe('ListMyRoomsService', () => {
  let service: ListMyRoomsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listByMember.mockResolvedValue({ data: [], total: 0 });
    service = new ListMyRoomsService(mockRepo);
  });

  // 呼叫者的 ID 必須原封不動傳到持久層——這是「只看得到自己的房間」的唯一實作點
  it('以呼叫者的 memberId 查詢', async () => {
    await service.execute({ memberId: 'me' });
    expect(mockRepo.listByMember).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'me' }),
    );
  });

  it('未指定分頁時套用預設值', async () => {
    await service.execute({ memberId: 'me' });
    const [params] = mockRepo.listByMember.mock.calls[0];
    expect(params.page).toBeGreaterThan(0);
    expect(params.limit).toBeGreaterThan(0);
  });

  it('回傳分頁 meta', async () => {
    mockRepo.listByMember.mockResolvedValue({ data: [], total: 7 });
    const result = await service.execute({ memberId: 'me', page: 1, limit: 5 });
    expect(result.meta.total).toBe(7);
    expect(result.meta.totalPages).toBe(2);
  });
});
