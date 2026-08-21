import { ListReportsService } from './ListReportsService';
import { GetReportDetailService } from './GetReportDetailService';
import { GetMemberTimelineService } from './GetMemberTimelineService';
import { ReviewReportService } from './ReviewReportService';
import { ChatReportNotFoundException } from '@app/domain/exception/ChatReportNotFoundException';
import { ChatReportInvalidTransitionException } from '@app/domain/exception/ChatReportInvalidTransitionException';
import type { ChatReportRepositoryPort } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';

const mockReportRepo = {
  list: jest.fn(),
  findDetail: jest.fn(),
  updateStatus: jest.fn(),
} as unknown as jest.Mocked<ChatReportRepositoryPort>;

const mockAudit = {
  record: jest.fn(),
  listByMember: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const detail = {
  reportId: 'rep-1',
  reporterId: 'reporter',
  targetMemberId: 'offender',
  targetMessageId: 'msg-1',
  roomId: 'room-1',
  reason: 'HARASSMENT' as const,
  status: 'PENDING' as const,
  description: '持續辱罵',
  contentSnapshot: '被檢舉的內容',
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: null,
  createdAt: new Date(0),
};

describe('ListReportsService', () => {
  let service: ListReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportRepo.list.mockResolvedValue({ data: [], total: 0 });
    service = new ListReportsService(mockReportRepo);
  });

  it('預設只查待處理', async () => {
    await service.execute({});
    expect(mockReportRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });

  it('可指定狀態', async () => {
    await service.execute({ status: 'REVIEWED' });
    expect(mockReportRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REVIEWED' }),
    );
  });

  /**
   * 列表不寫稽核——由**建構子簽章**保證，而不是靠測試斷言。
   *
   * `ListReportsService` 根本沒有注入稽核 port，因此「它會不會寫稽核」
   * 在型別層面就已經是否定的。在這裡寫 `expect(audit.record).not.toHaveBeenCalled()`
   * 是一條空測試：那個 mock 不可能被呼叫，斷言永遠成立、也永遠不會因為
   * 真正的迴歸而變紅。
   *
   * 真正有意義的檢查在 e2e：瀏覽列表後稽核表必須是空的。
   */
  it('建構子不接受稽核 port（列表不可能寫稽核）', () => {
    expect(ListReportsService.length).toBe(1);
  });
});

describe('GetReportDetailService', () => {
  let service: GetReportDetailService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportRepo.findDetail.mockResolvedValue(detail);
    mockAudit.record.mockResolvedValue(undefined);
    service = new GetReportDetailService(mockReportRepo, mockAudit);
  });

  it('回傳含內容快照的詳情', async () => {
    const result = await service.execute({
      reportId: 'rep-1',
      viewerId: 'admin',
    });
    expect(result.contentSnapshot).toBe('被檢舉的內容');
  });

  // 這是唯一能看到被撤回訊息內容的路徑；查看不留痕跡的話，
  // 它與「任何人都看得到」在事後沒有實質區別
  it('查看時寫入 REPORT_VIEWED 稽核', async () => {
    await service.execute({ reportId: 'rep-1', viewerId: 'admin' });

    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'admin',
      action: 'REPORT_VIEWED',
      roomId: 'room-1',
      targetMemberId: 'offender',
      targetMessageId: 'msg-1',
    });
  });

  it('稽核寫入失敗時，查詢仍照常回傳', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));

    await expect(
      service.execute({ reportId: 'rep-1', viewerId: 'admin' }),
    ).resolves.toEqual(detail);
  });

  it('檢舉不存在 → ChatReportNotFoundException，且不寫稽核', async () => {
    mockReportRepo.findDetail.mockResolvedValue(null);

    await expect(
      service.execute({ reportId: 'ghost', viewerId: 'admin' }),
    ).rejects.toThrow(ChatReportNotFoundException);
    expect(mockAudit.record).not.toHaveBeenCalled();
  });
});

describe('GetMemberTimelineService', () => {
  let service: GetMemberTimelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAudit.listByMember.mockResolvedValue({ data: [], total: 0 });
    service = new GetMemberTimelineService(mockAudit);
  });

  it('以成員為主體查詢', async () => {
    await service.execute({ memberId: 'someone' });
    expect(mockAudit.listByMember).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'someone' }),
    );
  });

  // 稽核紀錄不含訊息內容，因此查看時間軸不需要另外留稽核
  it('查時間軸不寫稽核', async () => {
    await service.execute({ memberId: 'someone' });
    expect(mockAudit.record).not.toHaveBeenCalled();
  });
});

describe('ReviewReportService', () => {
  let service: ReviewReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportRepo.updateStatus.mockResolvedValue(true);
    service = new ReviewReportService(mockReportRepo);
  });

  it('標記為已處理', async () => {
    await service.execute({
      reportId: 'rep-1',
      status: 'REVIEWED',
      reviewerId: 'admin',
      reviewNote: '已私下警告',
    });

    expect(mockReportRepo.updateStatus).toHaveBeenCalledWith({
      reportId: 'rep-1',
      status: 'REVIEWED',
      reviewedBy: 'admin',
      reviewNote: '已私下警告',
    });
  });

  // 終態間的更正是允許的
  it('REVIEWED 改為 DISMISSED → 允許', async () => {
    await expect(
      service.execute({
        reportId: 'rep-1',
        status: 'DISMISSED',
        reviewerId: 'admin',
      }),
    ).resolves.toBeUndefined();
  });

  // 回到待處理是「重新開啟」，語意不同且目前沒有這個需求
  it('改回 PENDING → ChatReportInvalidTransitionException，且不寫入', async () => {
    await expect(
      service.execute({
        reportId: 'rep-1',
        status: 'PENDING',
        reviewerId: 'admin',
      }),
    ).rejects.toThrow(ChatReportInvalidTransitionException);
    expect(mockReportRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('檢舉不存在 → ChatReportNotFoundException', async () => {
    mockReportRepo.updateStatus.mockResolvedValue(false);

    await expect(
      service.execute({
        reportId: 'ghost',
        status: 'REVIEWED',
        reviewerId: 'admin',
      }),
    ).rejects.toThrow(ChatReportNotFoundException);
  });
});
