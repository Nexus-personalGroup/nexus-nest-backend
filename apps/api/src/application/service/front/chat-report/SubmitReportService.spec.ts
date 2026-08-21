import { SubmitReportService } from './SubmitReportService';
import { ChatMessageNotFoundException } from '@app/domain/exception/ChatMessageNotFoundException';
import { ChatReportSelfException } from '@app/domain/exception/ChatReportSelfException';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import type { EnsureRoomMembershipUseCase } from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import type { ChatMessageRepositoryPort } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import type { ChatReportRepositoryPort } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';

const mockMembership = {
  execute: jest.fn(),
} as unknown as jest.Mocked<EnsureRoomMembershipUseCase>;

const mockMessageRepo = {
  findForReport: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

const mockReportRepo = {
  findOrCreate: jest.fn(),
} as unknown as jest.Mocked<ChatReportRepositoryPort>;

const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const message = {
  messageId: 'msg-1',
  roomId: 'room-1',
  senderId: 'offender',
  rawContent: '被檢舉的原始內容',
};

const summary = {
  reportId: 'rep-1',
  status: 'PENDING' as const,
  createdAt: new Date(0),
};

const command = {
  reporterId: 'me',
  messageId: 'msg-1',
  reason: 'HARASSMENT' as const,
  description: '持續辱罵',
};

describe('SubmitReportService', () => {
  let service: SubmitReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.execute.mockResolvedValue(undefined);
    mockMessageRepo.findForReport.mockResolvedValue(message);
    mockReportRepo.findOrCreate.mockResolvedValue(summary);
    mockAudit.record.mockResolvedValue(undefined);
    service = new SubmitReportService(
      mockMembership,
      mockMessageRepo,
      mockReportRepo,
      mockAudit,
    );
  });

  it('成員檢舉他人的訊息 → 建立檢舉', async () => {
    const result = await service.execute(command);

    expect(result).toEqual(summary);
    expect(mockReportRepo.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterId: 'me',
        targetMessageId: 'msg-1',
        targetMemberId: 'offender',
        roomId: 'room-1',
        reason: 'HARASSMENT',
      }),
    );
  });

  // 訊息可能在審閱前被撤回或清理；沒有快照的話管理員會看到一則空訊息，
  // 而檢舉人明明看到了東西
  it('快照取自未遮蔽的原始內容', async () => {
    await service.execute(command);

    expect(mockReportRepo.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ contentSnapshot: '被檢舉的原始內容' }),
    );
  });

  it('訊息不存在 → CHAT_MESSAGE_NOT_FOUND', async () => {
    mockMessageRepo.findForReport.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageNotFoundException,
    );
    expect(mockReportRepo.findOrCreate).not.toHaveBeenCalled();
  });

  // 分開等於提供探測任意訊息是否存在的工具
  it('非成員與訊息不存在回同一個錯誤碼', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());
    const notMember = await service.execute(command).catch((e) => e);

    mockMembership.execute.mockResolvedValue(undefined);
    mockMessageRepo.findForReport.mockResolvedValue(null);
    const missing = await service.execute(command).catch((e) => e);

    expect(notMember.code).toBe(missing.code);
  });

  it('非成員不得建立檢舉', async () => {
    mockMembership.execute.mockRejectedValue(new ChatRoomNotFoundException());

    await expect(service.execute(command)).rejects.toThrow(
      ChatMessageNotFoundException,
    );
    expect(mockReportRepo.findOrCreate).not.toHaveBeenCalled();
  });

  // 檢舉自己會是繞過撤回時限的側門——讓管理員幫忙刪掉
  it('檢舉自己的訊息 → ChatReportSelfException', async () => {
    mockMessageRepo.findForReport.mockResolvedValue({
      ...message,
      senderId: 'me',
    });

    await expect(service.execute(command)).rejects.toThrow(
      ChatReportSelfException,
    );
    expect(mockReportRepo.findOrCreate).not.toHaveBeenCalled();
  });

  // 逾時／自己檢舉與「不存在」用不同錯誤碼：能走到這裡代表訊息確實存在，
  // 沒有洩漏疑慮
  it('檢舉自己與「不存在」是不同的錯誤碼', async () => {
    mockMessageRepo.findForReport.mockResolvedValue({
      ...message,
      senderId: 'me',
    });
    const self = await service.execute(command).catch((e) => e);

    mockMessageRepo.findForReport.mockResolvedValue(null);
    const missing = await service.execute(command).catch((e) => e);

    expect(self.code).not.toBe(missing.code);
  });

  it('留下 REPORT_SUBMITTED 稽核紀錄', async () => {
    await service.execute(command);

    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'me',
      action: 'REPORT_SUBMITTED',
      roomId: 'room-1',
      targetMemberId: 'offender',
      targetMessageId: 'msg-1',
    });
  });

  it('稽核寫入失敗時，檢舉仍成功', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));

    await expect(service.execute(command)).resolves.toEqual(summary);
  });

  // 檢舉是收斂到某個狀態；冪等由 repository 的唯一索引保證，
  // service 不該有「先查有沒有」這個步驟
  it('不先查詢既有檢舉，直接交給 repository 處理冪等', async () => {
    await service.execute(command);

    expect(mockReportRepo.findOrCreate).toHaveBeenCalledTimes(1);
  });
});
