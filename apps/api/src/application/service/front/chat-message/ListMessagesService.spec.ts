import {
  ListMessagesService,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from './ListMessagesService';
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
  findBeforeSeq: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

const messagesOf = (count: number): ChatMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    messageId: `msg-${i}`,
    roomId: 'room-1',
    senderId: 'other',
    content: `第 ${i} 則`,
    seq: 100 - i,
    retractedAt: null,
    createdAt: new Date(0),
  }));

const query = { roomId: 'room-1', memberId: 'me' };

describe('ListMessagesService', () => {
  let service: ListMessagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.execute.mockResolvedValue(undefined);
    mockRepo.findBeforeSeq.mockResolvedValue([]);
    service = new ListMessagesService(mockMembership, mockRepo);
  });

  it('非成員查不到訊息', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());
    await expect(service.execute(query)).rejects.toThrow(
      ChatRoomNotFoundException,
    );
    expect(mockRepo.findBeforeSeq).not.toHaveBeenCalled();
  });

  it('未指定游標時從最新開始', async () => {
    await service.execute(query);
    expect(mockRepo.findBeforeSeq).toHaveBeenCalledWith(
      'room-1',
      undefined,
      DEFAULT_HISTORY_LIMIT + 1,
    );
  });

  it('帶游標時往更早查', async () => {
    await service.execute({ ...query, beforeSeq: 50 });
    expect(mockRepo.findBeforeSeq).toHaveBeenCalledWith(
      'room-1',
      50,
      expect.any(Number),
    );
  });

  // 少要一則的話，剛好滿載時會誤報 hasMore: false，使用者再也捲不到更早的訊息
  it('多要一則來判斷 hasMore', async () => {
    mockRepo.findBeforeSeq.mockResolvedValue(
      messagesOf(DEFAULT_HISTORY_LIMIT + 1),
    );
    const result = await service.execute(query);
    expect(result.list).toHaveLength(DEFAULT_HISTORY_LIMIT);
    expect(result.hasMore).toBe(true);
  });

  it('剛好等於上限 → hasMore 為 false', async () => {
    mockRepo.findBeforeSeq.mockResolvedValue(messagesOf(DEFAULT_HISTORY_LIMIT));
    const result = await service.execute(query);
    expect(result.hasMore).toBe(false);
  });

  // 上限存在的理由是保護資料庫；客戶端指定超過時夾住而非報錯
  it('limit 超過上限時夾在上限', async () => {
    await service.execute({ ...query, limit: 9_999 });
    expect(mockRepo.findBeforeSeq).toHaveBeenCalledWith(
      'room-1',
      undefined,
      MAX_HISTORY_LIMIT + 1,
    );
  });
});
