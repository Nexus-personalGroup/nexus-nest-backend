import { PrismaChatAuditRepository } from './PrismaChatAuditRepository';
import { getEnv } from '@app/infrastructure/validate-env';
import type { PrismaService } from '@app/infrastructure/prisma/prisma.service';

jest.mock('@app/infrastructure/validate-env', () => ({ getEnv: jest.fn() }));

const mockGetEnv = jest.mocked(getEnv);

const event = {
  memberId: 'm1',
  action: 'ROOM_LEFT' as const,
  roomId: 'r1',
};

describe('PrismaChatAuditRepository', () => {
  let create: jest.Mock;
  let repo: PrismaChatAuditRepository;

  const withAuditEnabled = (enabled: boolean): void => {
    mockGetEnv.mockReturnValue({
      CHAT_AUDIT_ENABLED: enabled,
    } as unknown as ReturnType<typeof getEnv>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks 不會還原 mockReturnValue，每支測試都要重設
    withAuditEnabled(true);
    create = jest.fn().mockResolvedValue({});
    repo = new PrismaChatAuditRepository({
      chatAuditLogRecord: { create },
    } as unknown as PrismaService);
  });

  it('寫入稽核紀錄', async () => {
    await repo.record(event);

    expect(create).toHaveBeenCalledWith({
      data: {
        memberId: 'm1',
        action: 'ROOM_LEFT',
        roomId: 'r1',
        targetMemberId: null,
        targetMessageId: null,
      },
    });
  });

  it('可選欄位缺席時寫入 null，不寫 undefined', async () => {
    await repo.record({ memberId: 'm1', action: 'ROOM_JOINED' });

    const [args] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data.roomId).toBeNull();
    expect(args.data.targetMemberId).toBeNull();
  });

  // 關閉時連查詢都不該發生——開關的意義是「完全不碰資料庫」
  it('稽核關閉時不寫入', async () => {
    withAuditEnabled(false);

    await repo.record(event);

    expect(create).not.toHaveBeenCalled();
  });

  // 內容已在 chat_messages，複製一份等於多一條洩漏路徑
  it('事件型別沒有承載內容的欄位', async () => {
    await repo.record(event);

    const [args] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(Object.keys(args.data)).not.toContain('content');
  });
});
