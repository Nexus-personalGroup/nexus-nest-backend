import { SyncRoomService, SYNC_BATCH_LIMIT } from './SyncRoomService';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import type { EnsureRoomMembershipUseCase } from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import type {
  ChatMessage,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

const mockMembership = {
  execute: jest.fn(),
} as unknown as jest.Mocked<EnsureRoomMembershipUseCase>;

const mockRepo = {
  findAfterSeq: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

const messagesOf = (count: number, startSeq = 1): ChatMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    messageId: `msg-${startSeq + i}`,
    roomId: 'room-1',
    senderId: 'other',
    content: `第 ${startSeq + i} 則`,
    seq: startSeq + i,
    retractedAt: null,
    removedAt: null,
    createdAt: new Date(0),
  }));

const query = { roomId: 'room-1', memberId: 'me', lastSeq: 40 };

describe('SyncRoomService', () => {
  let service: SyncRoomService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.execute.mockResolvedValue(undefined);
    mockRepo.findAfterSeq.mockResolvedValue([]);
    service = new SyncRoomService(mockMembership, mockRepo);
  });

  it('非成員無法補齊', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());
    await expect(service.execute(query)).rejects.toThrow(
      ChatRoomNotFoundException,
    );
    expect(mockRepo.findAfterSeq).not.toHaveBeenCalled();
  });

  it('回傳 seq 大於 lastSeq 的訊息', async () => {
    mockRepo.findAfterSeq.mockResolvedValue(messagesOf(3, 41));

    const result = await service.execute(query);

    expect(mockRepo.findAfterSeq).toHaveBeenCalledWith(
      'room-1',
      40,
      expect.any(Number),
    );
    expect(result.messages.map((m) => m.seq)).toEqual([41, 42, 43]);
    expect(result.hasMore).toBe(false);
  });

  // 少要一則的話，剛好滿載時會誤報 hasMore: false，客戶端就此停止補齊——
  // 症狀是靜默丟訊息，也就是本功能要防的問題之一
  it('多要一則來判斷 hasMore，不用「回傳數 === 上限」', async () => {
    await service.execute(query);
    expect(mockRepo.findAfterSeq).toHaveBeenCalledWith(
      'room-1',
      40,
      SYNC_BATCH_LIMIT + 1,
    );
  });

  it('剛好等於上限 → hasMore 為 false，且不截斷', async () => {
    mockRepo.findAfterSeq.mockResolvedValue(messagesOf(SYNC_BATCH_LIMIT, 41));

    const result = await service.execute(query);

    expect(result.messages).toHaveLength(SYNC_BATCH_LIMIT);
    expect(result.hasMore).toBe(false);
  });

  it('超過上限 → hasMore 為 true，且只回上限筆數', async () => {
    mockRepo.findAfterSeq.mockResolvedValue(
      messagesOf(SYNC_BATCH_LIMIT + 1, 41),
    );

    const result = await service.execute(query);

    expect(result.messages).toHaveLength(SYNC_BATCH_LIMIT);
    expect(result.hasMore).toBe(true);
    // 截斷必須從尾端切，回傳的要是最舊的那批——補齊是從斷點往前接上
    expect(result.messages[0].seq).toBe(41);
  });

  it('沒有漏接時回空陣列，不視為錯誤', async () => {
    const result = await service.execute(query);
    expect(result).toEqual({ roomId: 'room-1', messages: [], hasMore: false });
  });
});
