import { RetractMessageService } from './RetractMessageService';
import { ChatMessageNotFoundException } from '@app/domain/exception/ChatMessageNotFoundException';
import { ChatMessageRetractExpiredException } from '@app/domain/exception/ChatMessageRetractExpiredException';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import { getEnv } from '@app/infrastructure/validate-env';
import type { EnsureRoomMembershipUseCase } from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import type { ChatMessageRepositoryPort } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import type { EventPublisherPort } from '@app/application/port/out/EventPublisherPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';

jest.mock('@app/infrastructure/validate-env', () => ({ getEnv: jest.fn() }));

const mockGetEnv = jest.mocked(getEnv);

const mockMembership = {
  execute: jest.fn(),
} as unknown as jest.Mocked<EnsureRoomMembershipUseCase>;

const mockRepo = {
  findOwnership: jest.fn(),
  retract: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

const mockPublisher = {
  publishToRoom: jest.fn(),
  publishToMember: jest.fn(),
} as unknown as jest.Mocked<EventPublisherPort>;
const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const WINDOW_SEC = 300;
const command = { roomId: 'room-1', messageId: 'msg-1', memberId: 'me' };
const retractedAt = new Date('2026-08-21T00:00:00.000Z');

/** 以「現在」為基準建 createdAt，避免測試依賴固定時刻 */
const secondsAgo = (seconds: number): Date =>
  new Date(Date.now() - seconds * 1_000);

const ownership = (overrides: Record<string, unknown> = {}) => ({
  messageId: 'msg-1',
  senderId: 'me',
  createdAt: secondsAgo(10),
  retractedAt: null,
  removedAt: null,
  ...overrides,
});

describe('RetractMessageService', () => {
  let service: RetractMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAudit.record.mockResolvedValue(undefined);
    // clearAllMocks 不會還原 mockReturnValue，每支測試都要重設
    mockGetEnv.mockReturnValue({
      CHAT_RETRACT_WINDOW_SEC: WINDOW_SEC,
    } as unknown as ReturnType<typeof getEnv>);
    mockMembership.execute.mockResolvedValue(undefined);
    mockRepo.findOwnership.mockResolvedValue(ownership());
    mockRepo.retract.mockResolvedValue(retractedAt);
    service = new RetractMessageService(
      mockMembership,
      mockRepo,
      mockPublisher,
      mockAudit,
    );
  });

  it('發送者在時限內撤回 → 標記並推播', async () => {
    await service.execute(command);

    expect(mockRepo.retract).toHaveBeenCalledWith('msg-1', 'me');
    expect(mockPublisher.publishToRoom).toHaveBeenCalledWith(
      'room-1',
      SERVER_EVENTS.MESSAGE_RETRACTED,
      { messageId: 'msg-1', roomId: 'room-1', retractedAt },
    );
  });

  // 撤回要移除的就是內容；推播帶著它等於撤了個寂寞
  it('推播的 payload 不含 content', async () => {
    await service.execute(command);

    const [, , payload] = mockPublisher.publishToRoom.mock.calls[0];
    expect(payload).not.toHaveProperty('content');
  });

  it('非成員無法撤回', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());

    await expect(service.execute(command)).rejects.toThrow(
      ChatRoomNotFoundException,
    );
    expect(mockRepo.findOwnership).not.toHaveBeenCalled();
  });

  it('訊息不存在 → CHAT_MESSAGE_NOT_FOUND', async () => {
    mockRepo.findOwnership.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageNotFoundException,
    );
    expect(mockRepo.retract).not.toHaveBeenCalled();
  });

  // 分開回報等於提供探測任意訊息是否存在的工具
  it('撤回他人訊息 → 與「不存在」同一個錯誤', async () => {
    mockRepo.findOwnership.mockResolvedValue(
      ownership({ senderId: 'someone-else' }),
    );

    const notMine = await service.execute(command).catch((e) => e);
    mockRepo.findOwnership.mockResolvedValue(null);
    const missing = await service.execute(command).catch((e) => e);

    expect(notMine.code).toBe(missing.code);
  });

  it('超過時限 → CHAT_MESSAGE_RETRACT_EXPIRED', async () => {
    mockRepo.findOwnership.mockResolvedValue(
      ownership({ createdAt: secondsAgo(WINDOW_SEC + 60) }),
    );

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageRetractExpiredException,
    );
    expect(mockRepo.retract).not.toHaveBeenCalled();
  });

  // 逾時與「不是你的」刻意用不同錯誤碼：能走到逾時代表訊息確實是自己發的，
  // 沒有洩漏疑慮，而分開才給得出可行動的提示
  it('逾時與「不是你的」是不同的錯誤碼', async () => {
    mockRepo.findOwnership.mockResolvedValue(
      ownership({ createdAt: secondsAgo(WINDOW_SEC + 60) }),
    );
    const expired = await service.execute(command).catch((e) => e);

    mockRepo.findOwnership.mockResolvedValue(
      ownership({ senderId: 'someone-else' }),
    );
    const notMine = await service.execute(command).catch((e) => e);

    expect(expired.code).not.toBe(notMine.code);
  });

  it('剛好在時限邊界內 → 允許', async () => {
    mockRepo.findOwnership.mockResolvedValue(
      ownership({ createdAt: secondsAgo(WINDOW_SEC - 1) }),
    );

    await expect(service.execute(command)).resolves.toBeUndefined();
  });

  // 撤回是收斂到某個狀態，不是遞增操作——回錯誤只會逼客戶端處理無意義的分支
  it('重複撤回 → 成功且不重複推播', async () => {
    mockRepo.findOwnership.mockResolvedValue(
      ownership({ retractedAt: new Date() }),
    );

    await expect(service.execute(command)).resolves.toBeUndefined();
    expect(mockRepo.retract).not.toHaveBeenCalled();
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });

  // 沒有東西改變就不該有通知
  it('撤回失敗時不推播', async () => {
    mockRepo.findOwnership.mockResolvedValue(
      ownership({ createdAt: secondsAgo(WINDOW_SEC + 60) }),
    );

    await service.execute(command).catch(() => undefined);
    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
  });
});
