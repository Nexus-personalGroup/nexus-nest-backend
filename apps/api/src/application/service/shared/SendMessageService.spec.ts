import { SendMessageService } from './SendMessageService';
import { ChatMessageRateLimitedException } from '@app/domain/exception/ChatMessageRateLimitedException';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import type { EnsureRoomMembershipUseCase } from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import type {
  ChatMessage,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import type { MessageRateLimitPort } from '@app/application/port/out/MessageRateLimitPort';
import type { EventPublisherPort } from '@app/application/port/out/EventPublisherPort';

const mockMembership = {
  execute: jest.fn(),
} as unknown as jest.Mocked<EnsureRoomMembershipUseCase>;

const mockRateLimit = {
  hitAndCheck: jest.fn(),
} as unknown as jest.Mocked<MessageRateLimitPort>;

const mockRepo = {
  append: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

const mockPublisher = {
  publishToRoom: jest.fn(),
  publishToMember: jest.fn(),
} as unknown as jest.Mocked<EventPublisherPort>;

const message: ChatMessage = {
  messageId: 'msg-1',
  roomId: 'room-1',
  senderId: 'me',
  content: '午餐吃什麼',
  seq: 42,
  retractedAt: null,
  createdAt: new Date(0),
};

const command = {
  roomId: 'room-1',
  senderId: 'me',
  content: '午餐吃什麼',
  clientMessageId: 'client-1',
};

describe('SendMessageService', () => {
  let service: SendMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.execute.mockResolvedValue(undefined);
    mockRateLimit.hitAndCheck.mockResolvedValue(false);
    mockRepo.append.mockResolvedValue({ message, deduplicated: false });
    service = new SendMessageService(
      mockMembership,
      mockRateLimit,
      mockRepo,
      mockPublisher,
    );
  });

  it('寫入訊息並廣播給房間', async () => {
    const result = await service.execute(command);

    expect(result).toEqual(message);
    expect(mockRepo.append).toHaveBeenCalledWith(command);
    expect(mockPublisher.publishToRoom).toHaveBeenCalledWith(
      'room-1',
      SERVER_EVENTS.MESSAGE_CREATED,
      message,
    );
  });

  // 非成員的探測請求若先計入限流，會消耗被冒用者的配額
  it('先驗成員資格，再計入限流', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());

    await expect(service.execute(command)).rejects.toThrow(
      ChatRoomNotFoundException,
    );
    expect(mockRateLimit.hitAndCheck).not.toHaveBeenCalled();
    expect(mockRepo.append).not.toHaveBeenCalled();
  });

  it('超過限流時拋 ChatMessageRateLimitedException 且不寫入', async () => {
    mockRateLimit.hitAndCheck.mockResolvedValue(true);

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageRateLimitedException,
    );
    expect(mockRepo.append).not.toHaveBeenCalled();
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });

  // 樂觀回覆在寫入失敗時會讓使用者看到一則實際不存在的訊息，
  // 而且沒有回頭修正的機會——客戶端已經把它畫在畫面上了
  it('寫入失敗時不廣播，也不回傳結果', async () => {
    mockRepo.append.mockRejectedValue(new Error('DB 掛了'));

    await expect(service.execute(command)).rejects.toThrow();
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });

  // 首次送出時已經廣播過；再播一次對其他成員就是重複訊息
  it('重送（deduplicated）時回傳既有訊息但不重播', async () => {
    mockRepo.append.mockResolvedValue({ message, deduplicated: true });

    const result = await service.execute(command);

    expect(result).toEqual(message);
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });

  it('限流以「成員 + 房間」為單位', async () => {
    await service.execute(command);
    expect(mockRateLimit.hitAndCheck).toHaveBeenCalledWith('me', 'room-1');
  });
});
