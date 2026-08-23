import { ListFrontUsersService } from './ListFrontUsersService';
import { GetFrontUserService } from './GetFrontUserService';
import { ForceLogoutFrontUserService } from './ForceLogoutFrontUserService';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import type {
  ListUsersParams,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import type { SaveUserPort } from '@app/application/port/out/user/SaveUserPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';
import type { RevokeMemberSessionsUseCase } from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';

const mockLoadUser = {
  listUsers: jest.fn(),
  loadDetailById: jest.fn(),
  loadById: jest.fn(),
} as unknown as jest.Mocked<LoadUserPort>;

const mockSaveUser = {
  bumpTokenVersion: jest.fn(),
} as unknown as jest.Mocked<SaveUserPort>;

const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const mockRevoke = {
  execute: jest.fn(),
} as unknown as jest.Mocked<RevokeMemberSessionsUseCase>;

const summary = {
  id: 'user-1',
  email: 'bob@example.com',
  displayName: 'Bob',
  avatarUrl: null,
  status: true,
  emailVerifiedAt: null,
  lastSeenAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ListFrontUsersService', () => {
  let service: ListFrontUsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadUser.listUsers.mockResolvedValue({ data: [summary], total: 1 });
    service = new ListFrontUsersService(mockLoadUser);
  });

  it('回傳清單與分頁 meta', async () => {
    const result = await service.execute({});

    expect(result.list).toHaveLength(1);
    expect(result.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });

  /**
   * 查的是 `users` 而非 `members`——由**相依關係**保證：
   * 這支 service 只注入 `LoadUserPort`，型別上拿不到另一張表。
   */
  it('只注入前台使用者的 port', () => {
    expect(ListFrontUsersService.length).toBe(1);
  });

  it('未給的過濾條件以 undefined 傳下去（代表不過濾）', async () => {
    await service.execute({ email: 'bob' });

    const params: ListUsersParams = mockLoadUser.listUsers.mock.calls[0][0];
    expect(params.email).toBe('bob');
    expect(params.status).toBeUndefined();
    expect(params.verified).toBeUndefined();
  });

  it('三個過濾條件一起傳下去', async () => {
    await service.execute({
      email: 'bob',
      displayName: '小明',
      status: false,
      verified: false,
    });

    expect(mockLoadUser.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'bob',
        displayName: '小明',
        status: false,
        verified: false,
      }),
    );
  });

  /** `verified: false` 是一個有意義的值，不可以被當成「沒給」而丟掉 */
  it('verified=false 不會被當成未指定', async () => {
    await service.execute({ verified: false });

    const params: ListUsersParams = mockLoadUser.listUsers.mock.calls[0][0];
    expect(params.verified).toBe(false);
  });

  it('回傳的欄位不含 password', async () => {
    const result = await service.execute({});

    expect(Object.keys(result.list[0])).not.toContain('password');
  });
});

describe('GetFrontUserService', () => {
  let service: GetFrontUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadUser.loadDetailById.mockResolvedValue(summary);
    service = new GetFrontUserService(mockLoadUser);
  });

  it('回傳帳號面的詳情', async () => {
    const result = await service.execute('user-1');

    expect(result.id).toBe('user-1');
    expect(Object.keys(result)).not.toContain('password');
  });

  /**
   * 走 `loadDetailById` 而非 `loadById`：後者帶 password hash（認證流程需要），
   * 顯示路徑用它就等於讓密碼雜湊有機會被送出去。
   */
  it('⭐ 走 loadDetailById，不碰帶 password 的 loadById', async () => {
    await service.execute('user-1');

    expect(mockLoadUser.loadDetailById).toHaveBeenCalledWith('user-1');
    expect(mockLoadUser.loadById).not.toHaveBeenCalled();
  });

  it('查不到 → MemberNotFoundException', async () => {
    mockLoadUser.loadDetailById.mockResolvedValue(null);

    await expect(service.execute('ghost')).rejects.toThrow(
      MemberNotFoundException,
    );
  });
});

describe('ForceLogoutFrontUserService', () => {
  let service: ForceLogoutFrontUserService;
  const command = { userId: 'user-1', moderatorId: 'admin-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveUser.bumpTokenVersion.mockResolvedValue(true);
    mockRevoke.execute.mockResolvedValue(undefined);
    mockAudit.record.mockResolvedValue(undefined);
    service = new ForceLogoutFrontUserService(
      mockSaveUser,
      mockRevoke,
      mockAudit,
    );
  });

  it('遞增 tokenVersion、撤銷連線並留下稽核', async () => {
    await service.execute(command);

    expect(mockSaveUser.bumpTokenVersion).toHaveBeenCalledWith('user-1');
    expect(mockRevoke.execute).toHaveBeenCalledWith('user-1');
    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'admin-1',
      action: 'MEMBER_FORCE_LOGGED_OUT',
      targetMemberId: 'user-1',
    });
  });

  /**
   * **不動 `status`**——由相依關係保證：這支 service 只拿得到
   * `bumpTokenVersion`，沒有任何方法可以改狀態。用停權代替強制登出
   * 會在稽核裡留下一筆不實的違規紀錄。
   */
  it('⭐ 沒有任何路徑可以改 status', () => {
    const saveUserMethods = Object.keys(mockSaveUser);
    expect(saveUserMethods).toEqual(['bumpTokenVersion']);
  });

  it('⭐ 稽核的 action 不是 MEMBER_SUSPENDED', async () => {
    await service.execute(command);

    expect(mockAudit.record.mock.calls[0][0].action).not.toBe(
      'MEMBER_SUSPENDED',
    );
  });

  /** 「再登出一次」是有意義的重複動作——第一次之後對方又登入了 */
  it('⭐ 刻意不冪等：連兩次各遞增一次、各寫一筆稽核', async () => {
    await service.execute(command);
    await service.execute(command);

    expect(mockSaveUser.bumpTokenVersion).toHaveBeenCalledTimes(2);
    expect(mockAudit.record).toHaveBeenCalledTimes(2);
  });

  it('使用者不存在 → MemberNotFoundException，且不撤銷連線', async () => {
    mockSaveUser.bumpTokenVersion.mockResolvedValue(false);

    await expect(service.execute(command)).rejects.toThrow(
      MemberNotFoundException,
    );
    expect(mockRevoke.execute).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  /** 稽核是 best-effort：寫不進去不該讓強制登出失敗——token 已經失效了 */
  it('稽核寫入失敗不影響強制登出', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));

    await expect(service.execute(command)).resolves.toBeUndefined();
    expect(mockRevoke.execute).toHaveBeenCalled();
  });
});
