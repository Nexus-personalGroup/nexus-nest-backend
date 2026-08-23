import { SuspendFrontUserService } from './SuspendFrontUserService';
import { ReinstateFrontUserService } from './ReinstateFrontUserService';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import type { LoadUserPort } from '@app/application/port/out/user/LoadUserPort';
import type { SaveUserPort } from '@app/application/port/out/user/SaveUserPort';
import type { ChatAuditPort } from '@app/application/port/out/ChatAuditPort';
import type { RevokeMemberSessionsUseCase } from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';

const mockLoadUser = {
  loadById: jest.fn(),
} as unknown as jest.Mocked<LoadUserPort>;

const mockSaveUser = {
  suspend: jest.fn(),
  reinstate: jest.fn(),
} as unknown as jest.Mocked<SaveUserPort>;

const mockAudit = {
  record: jest.fn(),
} as unknown as jest.Mocked<ChatAuditPort>;

const mockRevoke = {
  execute: jest.fn(),
} as unknown as jest.Mocked<RevokeMemberSessionsUseCase>;

const userRow = {
  id: 'user-1',
  email: 'bob@example.com',
  password: 'hashed',
  displayName: 'Bob',
  avatarUrl: null,
  emailVerifiedAt: null,
  status: true,
  tokenVersion: 0,
  lastSeenAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const command = { userId: 'user-1', moderatorId: 'admin-1' };

describe('SuspendFrontUserService', () => {
  let service: SuspendFrontUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadUser.loadById.mockResolvedValue(userRow);
    mockSaveUser.suspend.mockResolvedValue(true);
    mockAudit.record.mockResolvedValue(undefined);
    mockRevoke.execute.mockResolvedValue(undefined);
    service = new SuspendFrontUserService(
      mockLoadUser,
      mockSaveUser,
      mockRevoke,
      mockAudit,
    );
  });

  it('停權會寫狀態、撤銷連線並留下稽核', async () => {
    await service.execute(command);

    expect(mockSaveUser.suspend).toHaveBeenCalledWith('user-1');
    expect(mockRevoke.execute).toHaveBeenCalledWith('user-1');
    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'admin-1',
      action: 'MEMBER_SUSPENDED',
      targetMemberId: 'user-1',
    });
  });

  /**
   * 稽核的兩個 ID 屬於**不同的身分空間**：執行者是管理員，對象是前台使用者。
   * 兩者寫反了不會有任何錯誤訊息，只會讓時間軸查不到東西。
   */
  it('稽核的執行者是管理員、對象是前台使用者', async () => {
    await service.execute(command);

    const event = mockAudit.record.mock.calls[0][0];
    expect(event.memberId).toBe('admin-1');
    expect(event.targetMemberId).toBe('user-1');
  });

  it('已停用的帳號重複停權 → 不重複斷線也不重複稽核', async () => {
    mockSaveUser.suspend.mockResolvedValue(false);

    await service.execute(command);

    expect(mockRevoke.execute).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('前台使用者不存在 → MemberNotFoundException，且不寫入任何東西', async () => {
    mockLoadUser.loadById.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      MemberNotFoundException,
    );
    expect(mockSaveUser.suspend).not.toHaveBeenCalled();
  });

  /**
   * 傳入管理員 ID 走的是「查不到」那條路。**沒有「不可停權自己」的檢查**——
   * 管理員與前台使用者是兩個不相交的身分空間，管理員的 ID 在 `users` 裡本來就不存在。
   */
  it('傳入後台管理員的 ID → 與查無此人同一條路徑', async () => {
    mockLoadUser.loadById.mockResolvedValue(null);

    await expect(
      service.execute({ userId: 'admin-1', moderatorId: 'admin-1' }),
    ).rejects.toThrow(MemberNotFoundException);
  });

  /** 稽核是 best-effort：寫不進去不該讓停權失敗——帳號已經停用了 */
  it('稽核寫入失敗不影響停權', async () => {
    mockAudit.record.mockRejectedValue(new Error('稽核表滿了'));

    await expect(service.execute(command)).resolves.toBeUndefined();
    expect(mockSaveUser.suspend).toHaveBeenCalled();
  });
});

describe('ReinstateFrontUserService', () => {
  let service: ReinstateFrontUserService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadUser.loadById.mockResolvedValue({ ...userRow, status: false });
    mockSaveUser.reinstate.mockResolvedValue(true);
    mockAudit.record.mockResolvedValue(undefined);
    service = new ReinstateFrontUserService(
      mockLoadUser,
      mockSaveUser,
      mockAudit,
    );
  });

  it('解除會寫狀態並留下稽核', async () => {
    await service.execute(command);

    expect(mockSaveUser.reinstate).toHaveBeenCalledWith('user-1');
    expect(mockAudit.record).toHaveBeenCalledWith({
      memberId: 'admin-1',
      action: 'MEMBER_REINSTATED',
      targetMemberId: 'user-1',
    });
  });

  it('帳號本來就是啟用的 → 不重複稽核', async () => {
    mockSaveUser.reinstate.mockResolvedValue(false);

    await service.execute(command);

    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('前台使用者不存在 → MemberNotFoundException', async () => {
    mockLoadUser.loadById.mockResolvedValue(null);

    await expect(service.execute(command)).rejects.toThrow(
      MemberNotFoundException,
    );
    expect(mockSaveUser.reinstate).not.toHaveBeenCalled();
  });

  /**
   * 解除**不推播也不撤銷連線**——由相依關係保證：這支 service 根本沒有
   * `RevokeMemberSessionsUseCase` 與 event publisher 可用。被停權者的連線早已斷開、
   * token 也失效了，沒有任何管道推得到他。
   */
  it('解除不注入撤銷連線與推播的相依', () => {
    expect(ReinstateFrontUserService.length).toBe(3);
  });
});
