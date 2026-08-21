import { RemoveMessageService } from './RemoveMessageService';
import { RestoreMessageService } from './RestoreMessageService';
import { ChatMessageNotFoundException } from '@app/domain/exception/ChatMessageNotFoundException';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';
import type { ChatMessageRepositoryPort } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';
import type { EventPublisherPort } from '@app/application/port/out/EventPublisherPort';

const mockRepo = {
  findForModeration: jest.fn(),
  remove: jest.fn(),
  restore: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const mockPublisher = {
  publishToRoom: jest.fn(),
  publishToMember: jest.fn(),
} as unknown as jest.Mocked<EventPublisherPort>;

const target = {
  messageId: 'msg-1',
  roomId: 'room-1',
  senderId: 'offender',
  seq: 42,
  retractedAt: null,
  removedAt: null,
};

const removedAt = new Date('2026-08-21T00:00:00.000Z');
const command = { messageId: 'msg-1', moderatorId: 'admin' };

describe('RemoveMessageService', () => {
  let service: RemoveMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.findForModeration.mockResolvedValue(target);
    mockRepo.remove.mockResolvedValue(removedAt);
    mockAudit.record.mockResolvedValue(undefined);
    service = new RemoveMessageService(mockRepo, mockAudit, mockPublisher);
  });

  it('移除訊息並推播', async () => {
    await service.execute(command);

    expect(mockRepo.remove).toHaveBeenCalledWith('msg-1', 'admin');
    expect(mockPublisher.publishToRoom).toHaveBeenCalledWith(
      'room-1',
      SERVER_EVENTS.MESSAGE_REMOVED,
      { messageId: 'msg-1', roomId: 'room-1', seq: 42, removedAt },
    );
  });

  // 移除要達成的就是讓內容看不到；推播帶著它等於白做
  it('推播不含 content', async () => {
    await service.execute(command);

    const [, , payload] = mockPublisher.publishToRoom.mock.calls[0];
    expect(payload).not.toHaveProperty('content');
  });

  it('留下 MESSAGE_REMOVED 稽核，含發送者', async () => {
    await service.execute(command);

    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'admin',
      action: 'MESSAGE_REMOVED',
      roomId: 'room-1',
      targetMemberId: 'offender',
      targetMessageId: 'msg-1',
    });
  });

  // 沒有任何改變就不該有通知，也不該有稽核——那會記下一件沒發生的事
  it('已移除時不推播、不記稽核', async () => {
    mockRepo.remove.mockResolvedValue(null);

    await service.execute(command);

    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('訊息不存在 → ChatMessageNotFoundException', async () => {
    mockRepo.findForModeration.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageNotFoundException,
    );
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  // 管理員可能從私訊、主動巡邏發現違規內容——授權來自 RBAC，不來自檢舉的存在
  it('不檢查該訊息是否被檢舉過', async () => {
    await service.execute(command);

    // 只查了 moderation target，沒有任何檢舉相關的查詢
    expect(mockRepo.findForModeration).toHaveBeenCalledTimes(1);
  });

  it('稽核寫入失敗時，移除仍成功且照常推播', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));

    await expect(service.execute(command)).resolves.toBeUndefined();
    expect(mockPublisher.publishToRoom).toHaveBeenCalled();
  });
});

describe('RestoreMessageService', () => {
  let service: RestoreMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.findForModeration.mockResolvedValue({ ...target, removedAt });
    mockRepo.restore.mockResolvedValue({ retractedAt: null });
    mockAudit.record.mockResolvedValue(undefined);
    service = new RestoreMessageService(mockRepo, mockAudit, mockPublisher);
  });

  it('還原並推播', async () => {
    await service.execute(command);

    expect(mockPublisher.publishToRoom).toHaveBeenCalledWith(
      'room-1',
      SERVER_EVENTS.MESSAGE_RESTORED,
      { messageId: 'msg-1', roomId: 'room-1', seq: 42, retractedAt: null },
    );
  });

  // removedAt 清除後，「這則曾被移除過」就不再留在訊息列上——
  // 而反覆移除再還原本身就是可疑行為
  it('留下 MESSAGE_RESTORED 稽核', async () => {
    await service.execute(command);

    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MESSAGE_RESTORED' }),
    );
  });

  // 若該則原本已被發送者撤回，還原後應回到「已收回」而非完全正常
  it('推播帶還原後的撤回狀態', async () => {
    const retractedAt = new Date('2026-08-20T00:00:00.000Z');
    mockRepo.restore.mockResolvedValue({ retractedAt });

    await service.execute(command);

    const [, , payload] = mockPublisher.publishToRoom.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({ retractedAt }));
  });

  it('本來就沒被移除時不推播、不記稽核', async () => {
    mockRepo.restore.mockResolvedValue(null);

    await service.execute(command);

    expect(mockPublisher.publishToRoom).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('訊息不存在 → ChatMessageNotFoundException', async () => {
    mockRepo.findForModeration.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageNotFoundException,
    );
  });
});
