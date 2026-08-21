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
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';
import type { MetricsPort } from '@app/application/port/out/MetricsPort';

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
const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const mockMetrics = {
  incrementMessages: jest.fn(),
  observeMessageWriteSeconds: jest.fn(),
  incrementRateLimited: jest.fn(),
  incrementWsEvent: jest.fn(),
  setConnections: jest.fn(),
} as unknown as jest.Mocked<MetricsPort>;

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
    mockAudit.record.mockResolvedValue(undefined);
    mockMembership.execute.mockResolvedValue(undefined);
    mockRateLimit.hitAndCheck.mockResolvedValue(false);
    mockRepo.append.mockResolvedValue({ message, deduplicated: false });
    service = new SendMessageService(
      mockMembership,
      mockRateLimit,
      mockRepo,
      mockPublisher,
      mockAudit,
      mockMetrics,
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

  // 送出訊息**不記稽核**：chat_messages 已經記了發送者、房間、時間、序號，
  // 再寫一筆只是把同一份中繼資料存兩次。這是最容易「順手加上去」的一筆
  it('送出成功時不寫稽核紀錄', async () => {
    await service.execute(command);
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  // 被限流擋下不會留下任何其他痕跡，是洗版行為的唯一證據
  it('被限流擋下時寫稽核紀錄', async () => {
    mockRateLimit.hitAndCheck.mockResolvedValue(true);

    await service.execute(command).catch(() => undefined);

    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'me',
      action: 'MESSAGE_RATE_LIMITED',
      roomId: 'room-1',
    });
  });

  // 稽核表滿了不該讓使用者送不出訊息
  it('稽核寫入失敗時，業務動作仍照常完成', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));
    mockRateLimit.hitAndCheck.mockResolvedValue(true);

    // 限流的錯誤照常拋出，但不是稽核的錯誤
    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageRateLimitedException,
    );
  });

  it('送出成功時計數一次', async () => {
    await service.execute(command);
    expect(mockMetrics.incrementMessages).toHaveBeenCalledTimes(1);
  });

  // 重送不是一則新訊息；計進去會讓流量指標虛高
  it('重送不計數', async () => {
    mockRepo.append.mockResolvedValue({ message, deduplicated: true });

    await service.execute(command);

    expect(mockMetrics.incrementMessages).not.toHaveBeenCalled();
  });

  it('記錄寫入耗時', async () => {
    await service.execute(command);
    expect(mockMetrics.observeMessageWriteSeconds).toHaveBeenCalledWith(
      expect.any(Number),
    );
  });

  it('被限流擋下時計數', async () => {
    mockRateLimit.hitAndCheck.mockResolvedValue(true);

    await service.execute(command).catch(() => undefined);

    expect(mockMetrics.incrementRateLimited).toHaveBeenCalledTimes(1);
  });
});
