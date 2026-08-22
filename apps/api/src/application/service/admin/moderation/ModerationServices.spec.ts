import { ListReportsService } from './ListReportsService';
import { GetReportDetailService } from './GetReportDetailService';
import { GetMemberTimelineService } from './GetMemberTimelineService';
import { GetMemberProfileService } from './GetMemberProfileService';
import { ListMemberReportsService } from './ListMemberReportsService';
import { ListRoomsService } from './ListRoomsService';
import { GetRoomDetailService } from './GetRoomDetailService';
import { ChatRoomNotFoundException } from '@app/domain/exception/ChatRoomNotFoundException';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import type { ChatRoomRepositoryPort } from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import type { PresencePort } from '@app/application/port/out/presence/PresencePort';
import { ReviewReportService } from './ReviewReportService';
import { ChatReportNotFoundException } from '@app/domain/exception/ChatReportNotFoundException';
import { ChatReportInvalidTransitionException } from '@app/domain/exception/ChatReportInvalidTransitionException';
import type { ChatReportRepositoryPort } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';
import type { LoadMemberPort } from '@app/application/port/out/member/LoadMemberPort';
import type { ChatMessageRepositoryPort } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import { CHAT_AUDIT_PORT } from '@app/application/port/out/ChatAuditPort';

const mockReportRepo = {
  list: jest.fn(),
  findDetail: jest.fn(),
  updateStatus: jest.fn(),
  countByMember: jest.fn(),
  listByMember: jest.fn(),
} as unknown as jest.Mocked<ChatReportRepositoryPort>;

const mockRoomRepo = {
  listByMember: jest.fn(),
  listAll: jest.fn(),
  findAdminDetail: jest.fn(),
} as unknown as jest.Mocked<ChatRoomRepositoryPort>;

const mockPresence = {
  isOnline: jest.fn(),
} as unknown as jest.Mocked<PresencePort>;

const mockAudit = {
  record: jest.fn(),
  listByMember: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const mockMemberRepo = {
  findEmailsByIds: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockMessageRepo = {
  findForModeration: jest.fn(),
} as unknown as jest.Mocked<ChatMessageRepositoryPort>;

/** 檢舉列表的一筆；`makeRow` 讓每支測試只寫它在意的欄位 */
const makeRow = (
  over: Partial<{ reporterId: string; targetMemberId: string }>,
) => ({
  reportId: 'rep-x',
  reporterId: 'reporter',
  targetMemberId: 'offender',
  roomId: 'room-1',
  reason: 'HARASSMENT' as const,
  status: 'PENDING' as const,
  createdAt: new Date(0),
  ...over,
});

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
    mockMemberRepo.findEmailsByIds.mockResolvedValue(new Map());
    service = new ListReportsService(mockReportRepo, mockMemberRepo);
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
   * 列表不寫稽核——由**相依關係**保證，而不是靠測試斷言。
   *
   * `ListReportsService` 沒有注入稽核 port，因此「它會不會寫稽核」
   * 在型別層面就已經是否定的。寫 `expect(audit.record).not.toHaveBeenCalled()`
   * 是一條空測試：那個 mock 不可能被呼叫，斷言永遠成立、也永遠不會因為
   * 真正的迴歸而變紅。
   *
   * **改為檢查注入的 token 而非建構子參數個數**：原本斷言 `.length === 1`，
   * 但那會在加入任何一個正當的相依時變紅（補 email 就是），
   * 而它變紅的理由與它想守的事情無關——那種測試只會被順手改掉，
   * 守則也就跟著消失了。
   *
   * 真正有意義的檢查在 e2e：瀏覽列表後稽核表必須是空的。
   */
  it('沒有注入稽核 port（列表不可能寫稽核）', () => {
    const injected: unknown = Reflect.getMetadata(
      'self:paramtypes',
      ListReportsService,
    );
    const tokens = Array.isArray(injected)
      ? injected.map((dep: { param: unknown }) => dep.param)
      : [];

    expect(tokens).not.toContain(CHAT_AUDIT_PORT);
  });

  it('⭐ 一頁只查一次 email，不逐列查', async () => {
    mockReportRepo.list.mockResolvedValue({
      data: Array.from({ length: 15 }, (_, i) =>
        makeRow({ reporterId: `reporter-${i}`, targetMemberId: `target-${i}` }),
      ),
      total: 15,
    });

    await service.execute({});

    // 逐列查在 15 筆的測試資料上跑起來完全正常，只有計次抓得到
    expect(mockMemberRepo.findEmailsByIds).toHaveBeenCalledTimes(1);
  });

  it('查詢前先去重：同一人在多筆檢舉中只送一次 id', async () => {
    mockReportRepo.list.mockResolvedValue({
      data: [
        makeRow({ reporterId: 'alice', targetMemberId: 'bob' }),
        makeRow({ reporterId: 'carol', targetMemberId: 'bob' }),
      ],
      total: 2,
    });

    await service.execute({});

    const ids: string[] = mockMemberRepo.findEmailsByIds.mock.calls[0][0];
    expect([...ids].sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('補上兩造的 email', async () => {
    mockReportRepo.list.mockResolvedValue({
      data: [makeRow({ reporterId: 'alice', targetMemberId: 'bob' })],
      total: 1,
    });
    mockMemberRepo.findEmailsByIds.mockResolvedValue(
      new Map([
        ['alice', 'alice@example.com'],
        ['bob', 'bob@example.com'],
      ]),
    );

    const { list } = await service.execute({});

    expect(list[0].reporterEmail).toBe('alice@example.com');
    expect(list[0].targetMemberEmail).toBe('bob@example.com');
  });

  // 帳號被刪除不該讓檢舉無法審閱——這正是 chat_reports 刻意不建外鍵的理由
  it('帳號已刪除 → 該欄為 null，其餘欄位照常', async () => {
    mockReportRepo.list.mockResolvedValue({
      data: [makeRow({ reporterId: 'alice', targetMemberId: 'ghost' })],
      total: 1,
    });
    mockMemberRepo.findEmailsByIds.mockResolvedValue(
      new Map([['alice', 'alice@example.com']]),
    );

    const { list } = await service.execute({});

    expect(list[0].targetMemberEmail).toBeNull();
    expect(list[0].reporterEmail).toBe('alice@example.com');
    expect(list[0].reason).toBe('HARASSMENT');
  });

  it('空列表不發出 email 查詢的無效呼叫', async () => {
    await service.execute({});

    const ids: string[] = mockMemberRepo.findEmailsByIds.mock.calls[0][0];
    expect(ids).toEqual([]);
  });
});

describe('GetReportDetailService', () => {
  let service: GetReportDetailService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportRepo.findDetail.mockResolvedValue(detail);
    mockAudit.record.mockResolvedValue(undefined);
    mockMemberRepo.findEmailsByIds.mockResolvedValue(new Map());
    mockMessageRepo.findForModeration.mockResolvedValue(null);
    service = new GetReportDetailService(
      mockReportRepo,
      mockAudit,
      mockMemberRepo,
      mockMessageRepo,
    );
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
    ).resolves.toEqual(expect.objectContaining(detail));
  });

  it('補上兩造的 email', async () => {
    mockMemberRepo.findEmailsByIds.mockResolvedValue(
      new Map([
        ['reporter', 'alice@example.com'],
        ['offender', 'bob@example.com'],
      ]),
    );

    const result = await service.execute({
      reportId: 'rep-1',
      viewerId: 'admin',
    });

    expect(result.reporterEmail).toBe('alice@example.com');
    expect(result.targetMemberEmail).toBe('bob@example.com');
  });

  it('訊息已被移除 → 回傳移除時間', async () => {
    const removedAt = new Date('2026-08-21T06:00:00.000Z');
    mockMessageRepo.findForModeration.mockResolvedValue({
      messageId: 'msg-1',
      roomId: 'room-1',
      senderId: 'offender',
      seq: 1,
      retractedAt: null,
      removedAt,
    });

    const result = await service.execute({
      reportId: 'rep-1',
      viewerId: 'admin',
    });

    expect(result.targetMessageRemovedAt).toEqual(removedAt);
  });

  it('訊息未被移除 → null', async () => {
    mockMessageRepo.findForModeration.mockResolvedValue({
      messageId: 'msg-1',
      roomId: 'room-1',
      senderId: 'offender',
      seq: 1,
      retractedAt: null,
      removedAt: null,
    });

    const result = await service.execute({
      reportId: 'rep-1',
      viewerId: 'admin',
    });

    expect(result.targetMessageRemovedAt).toBeNull();
  });

  // 檢舉的快照本來就不依賴訊息是否還在——查不到不是錯誤
  it('訊息已不存在 → null，詳情照常回傳', async () => {
    mockMessageRepo.findForModeration.mockResolvedValue(null);

    const result = await service.execute({
      reportId: 'rep-1',
      viewerId: 'admin',
    });

    expect(result.targetMessageRemovedAt).toBeNull();
    expect(result.contentSnapshot).toBe('被檢舉的內容');
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

describe('GetMemberProfileService', () => {
  let service: GetMemberProfileService;

  const memberRow = {
    id: 'member-1',
    email: 'bob@example.com',
    member: 'Bob',
    roleId: 'role-1',
    roleName: '一般成員',
    status: true,
    isDefault: false,
    createdAt: new Date('2026-01-15T02:30:00.000Z'),
    updatedAt: new Date(0),
    lastLoginAt: new Date(0),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMemberRepo.loadMemberById = jest.fn().mockResolvedValue(memberRow);
    mockReportRepo.countByMember.mockResolvedValue(0);
    mockRoomRepo.listByMember.mockResolvedValue({ data: [], total: 0 });
    mockPresence.isOnline.mockResolvedValue(false);
    service = new GetMemberProfileService(
      mockMemberRepo,
      mockReportRepo,
      mockRoomRepo,
      mockPresence,
    );
  });

  it('回傳七個審閱欄位', async () => {
    mockReportRepo.countByMember
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    mockRoomRepo.listByMember.mockResolvedValue({ data: [], total: 5 });
    mockPresence.isOnline.mockResolvedValue(true);

    const result = await service.execute('member-1');

    expect(result).toEqual({
      memberId: 'member-1',
      email: 'bob@example.com',
      status: true,
      joinedAt: memberRow.createdAt,
      isOnline: true,
      reportedCount: 3,
      submittedReportCount: 1,
      roomCount: 5,
    });
  });

  /**
   * 「反正 `loadMemberById` 都查回來了，順手全回」是這裡最容易發生的越界。
   *
   * 角色與權限回答的是「他能做什麼」——那屬於 `BACKEND:ACCOUNT:VIEW` 圈起來的範圍，
   * 而本端點的授權是 `BACKEND:MODERATION:VIEW`。用 `toEqual` 而非
   * `objectContaining` 就是為了讓多回的欄位當場變紅。
   */
  it('⭐ 不回傳角色、名稱等帳號管理的資料', async () => {
    const result = await service.execute('member-1');

    expect(Object.keys(result).sort()).toEqual([
      'email',
      'isOnline',
      'joinedAt',
      'memberId',
      'reportedCount',
      'roomCount',
      'status',
      'submittedReportCount',
    ]);
  });

  it('兩個方向的計數分開查', async () => {
    await service.execute('member-1');

    expect(mockReportRepo.countByMember).toHaveBeenCalledWith(
      'member-1',
      'TARGET',
    );
    expect(mockReportRepo.countByMember).toHaveBeenCalledWith(
      'member-1',
      'REPORTER',
    );
  });

  // 被檢舉 500 次的帳號不該為了一個數字把 500 筆撈進記憶體
  it('⭐ 計數用 count，不取回清單再算長度', async () => {
    await service.execute('member-1');

    expect(mockReportRepo.countByMember).toHaveBeenCalled();
    expect(mockReportRepo.listByMember).not.toHaveBeenCalled();
  });

  it('沒有任何檢舉紀錄 → 兩個計數為 0', async () => {
    const result = await service.execute('member-1');

    expect(result.reportedCount).toBe(0);
    expect(result.submittedReportCount).toBe(0);
  });

  it('成員不存在 → MemberNotFoundException', async () => {
    mockMemberRepo.loadMemberById = jest.fn().mockResolvedValue(null);

    await expect(service.execute('ghost')).rejects.toThrow(
      MemberNotFoundException,
    );
  });

  /**
   * 概覽不寫稽核——由**相依關係**保證。
   *
   * 回應不含任何訊息內容，記了會讓稽核量與「點了幾下」對齊。
   * 與 `ListReportsService` 同樣檢查注入的 token 而非建構子參數個數：
   * 後者會在加入任何一個正當相依時變紅，而變紅的理由與它想守的事情無關。
   */
  it('沒有注入稽核 port（概覽不可能寫稽核）', () => {
    const injected: unknown = Reflect.getMetadata(
      'self:paramtypes',
      GetMemberProfileService,
    );
    const tokens = Array.isArray(injected)
      ? injected.map((dep: { param: unknown }) => dep.param)
      : [];

    expect(tokens).not.toContain(CHAT_AUDIT_PORT);
  });
});

describe('ListMemberReportsService', () => {
  let service: ListMemberReportsService;

  const row = {
    reportId: 'rep-1',
    counterpartId: 'alice',
    roomId: 'room-1',
    reason: 'HARASSMENT' as const,
    status: 'PENDING' as const,
    createdAt: new Date(0),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportRepo.listByMember.mockResolvedValue({ data: [row], total: 1 });
    mockMemberRepo.findEmailsByIds.mockResolvedValue(new Map());
    service = new ListMemberReportsService(mockReportRepo, mockMemberRepo);
  });

  it('預設查「被檢舉」的方向', async () => {
    await service.execute({ memberId: 'bob' });

    expect(mockReportRepo.listByMember).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'bob', role: 'TARGET' }),
    );
  });

  it('可指定查「提出的」', async () => {
    await service.execute({ memberId: 'bob', role: 'REPORTER' });

    expect(mockReportRepo.listByMember).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'REPORTER' }),
    );
  });

  it('補上對造的 email', async () => {
    mockMemberRepo.findEmailsByIds.mockResolvedValue(
      new Map([['alice', 'alice@example.com']]),
    );

    const { list } = await service.execute({ memberId: 'bob' });

    expect(list[0].counterpartEmail).toBe('alice@example.com');
  });

  it('對造帳號已刪除 → null，該列其餘照常', async () => {
    const { list } = await service.execute({ memberId: 'bob' });

    expect(list[0].counterpartEmail).toBeNull();
    expect(list[0].reportId).toBe('rep-1');
  });

  it('⭐ 一頁只查一次 email', async () => {
    mockReportRepo.listByMember.mockResolvedValue({
      data: Array.from({ length: 15 }, (_, i) => ({
        ...row,
        reportId: `rep-${i}`,
        counterpartId: `other-${i}`,
      })),
      total: 15,
    });

    await service.execute({ memberId: 'bob' });

    expect(mockMemberRepo.findEmailsByIds).toHaveBeenCalledTimes(1);
  });
});

describe('ListRoomsService', () => {
  let service: ListRoomsService;

  const room = {
    roomId: 'room-1',
    roomType: 'GROUP' as const,
    name: '午餐團',
    memberCount: 3,
    messageCount: 10,
    createdAt: new Date(0),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomRepo.listAll.mockResolvedValue({ data: [room], total: 1 });
    service = new ListRoomsService(mockRoomRepo);
  });

  it('未指定類型 → 不篩選', async () => {
    await service.execute({});

    expect(mockRoomRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ roomType: undefined }),
    );
  });

  it('可指定只看群組', async () => {
    await service.execute({ roomType: 'GROUP' });

    expect(mockRoomRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ roomType: 'GROUP' }),
    );
  });

  /**
   * `messageCount` 來自 `chat_rooms.last_seq`，不是訊息列的 count。
   *
   * 這支測試用「repository 回 messageCount=10」來釘住 service 不會自作聰明
   * 去重算——真正驗證資料來源的是 e2e（發 3 則、撤回 1、移除 1，仍是 3）。
   */
  it('訊息量原樣傳遞，service 不重算', async () => {
    const { list } = await service.execute({});

    expect(list[0].messageCount).toBe(10);
  });

  // 回應不含任何訊息內容，記了會讓稽核量與「點了幾下」對齊
  it('沒有注入稽核 port（列表不可能寫稽核）', () => {
    const injected: unknown = Reflect.getMetadata(
      'self:paramtypes',
      ListRoomsService,
    );
    const tokens = Array.isArray(injected)
      ? injected.map((dep: { param: unknown }) => dep.param)
      : [];

    expect(tokens).not.toContain(CHAT_AUDIT_PORT);
  });
});

describe('GetRoomDetailService', () => {
  let service: GetRoomDetailService;

  const detail = {
    roomId: 'room-1',
    roomType: 'GROUP' as const,
    name: '午餐團',
    memberCount: 2,
    messageCount: 10,
    createdAt: new Date(0),
    members: [
      { memberId: 'alice', joinedAt: new Date(0) },
      { memberId: 'ghost', joinedAt: new Date(0) },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomRepo.findAdminDetail.mockResolvedValue(detail);
    mockMemberRepo.findEmailsByIds.mockResolvedValue(
      new Map([['alice', 'alice@example.com']]),
    );
    service = new GetRoomDetailService(mockRoomRepo, mockMemberRepo);
  });

  it('補上成員的 email', async () => {
    const result = await service.execute('room-1');

    expect(result.members[0].email).toBe('alice@example.com');
  });

  // 帳號刪除不該讓成員從房間裡消失——那會讓成員數與清單長度對不起來
  it('帳號已刪除 → email 為 null，該成員仍在清單中', async () => {
    const result = await service.execute('room-1');

    expect(result.members[1].email).toBeNull();
    expect(result.members).toHaveLength(2);
  });

  it('⭐ 補 email 只查一次', async () => {
    await service.execute('room-1');

    expect(mockMemberRepo.findEmailsByIds).toHaveBeenCalledTimes(1);
  });

  it('房間不存在 → ChatRoomNotFoundException', async () => {
    mockRoomRepo.findAdminDetail.mockResolvedValue(null);

    await expect(service.execute('ghost-room')).rejects.toThrow(
      ChatRoomNotFoundException,
    );
  });
});
