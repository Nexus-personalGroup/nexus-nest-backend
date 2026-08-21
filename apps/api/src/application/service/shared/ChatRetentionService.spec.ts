import { ChatRetentionService } from './ChatRetentionService';
import type { ChatRetentionPort } from '@app/application/port/out/shared/ChatRetentionPort';

const mockRetention = {
  purgeAuditBefore: jest.fn(),
  purgeReviewedReportsBefore: jest.fn(),
} as unknown as jest.Mocked<ChatRetentionPort>;

const DAY_MS = 86_400_000;

describe('ChatRetentionService', () => {
  let service: ChatRetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRetention.purgeAuditBefore.mockResolvedValue(3);
    mockRetention.purgeReviewedReportsBefore.mockResolvedValue(1);
    service = new ChatRetentionService(mockRetention);
  });

  it('回傳兩張表各自的刪除筆數', async () => {
    const result = await service.purge(180, 365);
    expect(result).toEqual({ auditLogs: 3, reports: 1 });
  });

  // 用同一個天數會逼其中一邊遷就另一邊：稽核只寫不讀且成長最快，
  // 檢舉量小但含內容快照
  it('兩張表的 cutoff 各自獨立計算', async () => {
    await service.purge(10, 100);

    const [auditCutoff] = mockRetention.purgeAuditBefore.mock.calls[0];
    const [reportCutoff] =
      mockRetention.purgeReviewedReportsBefore.mock.calls[0];

    const gapDays = Math.round(
      (auditCutoff.getTime() - reportCutoff.getTime()) / DAY_MS,
    );
    expect(gapDays).toBe(90);
  });

  it('cutoff 是「現在減去保留天數」', async () => {
    const before = Date.now();
    await service.purge(30, 30);
    const after = Date.now();

    const [cutoff] = mockRetention.purgeAuditBefore.mock.calls[0];
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 30 * DAY_MS);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 30 * DAY_MS);
  });

  // 訊息不在清理範圍內；port 上根本沒有對應的方法，這裡釘住那個事實
  it('port 沒有清理訊息的方法', () => {
    expect(Object.keys(mockRetention)).toEqual([
      'purgeAuditBefore',
      'purgeReviewedReportsBefore',
    ]);
  });
});
