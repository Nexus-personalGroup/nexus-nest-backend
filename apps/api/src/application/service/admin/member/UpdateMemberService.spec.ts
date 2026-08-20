import * as bcrypt from 'bcrypt';
import { UpdateMemberService } from './UpdateMemberService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { SaveMemberPort } from '../../../port/out/member/SaveMemberPort';
import { LoadRolePort } from '../../../port/out/role/LoadRolePort';
import { ClearMemberContextPort } from '../../../port/out/member/ClearMemberContextPort';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { Member } from '@app/domain/model/Member';
import { CannotDisableSelfException } from '@app/domain/exception/CannotDisableSelfException';
import { DefaultMemberNotEditableException } from '@app/domain/exception/DefaultMemberNotEditableException';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({
    APPLICATION_PASSWORD_MIN_LENGTH: 8,
    APPLICATION_PASSWORD_MAX_LENGTH: 32,
    APPLICATION_SYSTEM_ADMIN_PASSWORD_COMPLEXITY: 4,
    APPLICATION_OTHER_ADMIN_PASSWORD_COMPLEXITY: 1,
  }),
}));

const MEMBER_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '00000000-0000-4000-8000-000000000002';
const ROLE_ID = '00000000-0000-4000-8000-000000000010';
const NEW_ROLE_ID = '00000000-0000-4000-8000-000000000011';

const makeMember = (overrides: { isDefault?: boolean } = {}): Member =>
  Member.reconstitute(
    MEMBER_ID,
    'target@test.com',
    'Target',
    '$2b$10$hashed',
    ROLE_ID,
    true,
    overrides.isDefault ?? false,
    new Date('2024-01-01T00:00:00.000Z'),
    'admin',
  );

const mockLoadMember = {
  existsByEmail: jest.fn(),
  loadMemberByEmail: jest.fn(),
  loadMemberById: jest.fn(),
  loadMemberDomainById: jest.fn(),
  listMembers: jest.fn(),
  loadMemberContext: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockSaveMember = {
  createMember: jest.fn(),
  updateMember: jest.fn(),
  saveMemberWithPassword: jest.fn(),
  deleteMember: jest.fn(),
  updateLastLoginAt: jest.fn(),
  incrementTokenVersion: jest.fn(),
} as jest.Mocked<SaveMemberPort>;

const mockLoadRole = {
  findRoleById: jest.fn(),
  findDefaultRoleId: jest.fn(),
  listActiveRoles: jest.fn(),
  findActiveRoleOption: jest.fn(),
} as jest.Mocked<LoadRolePort>;

const mockClearMemberContext = {
  clearMemberContext: jest.fn(),
} as jest.Mocked<ClearMemberContextPort>;

const makePasswordPolicy = () => {
  const svc = new PasswordPolicyService();
  svc.onModuleInit();
  return svc;
};

const makeService = () =>
  new UpdateMemberService(
    mockLoadMember,
    mockSaveMember,
    mockLoadRole,
    mockClearMemberContext,
    10,
    makePasswordPolicy(),
  );

describe('UpdateMemberService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadMember.loadMemberDomainById.mockResolvedValue(makeMember());
    mockLoadMember.existsByEmail.mockResolvedValue(false);
    mockLoadRole.findRoleById.mockResolvedValue({
      id: NEW_ROLE_ID,
      name: 'Admin',
      roleCode: null,
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
  });

  // ── partial 行為 ─────────────────────────────

  it('只送 { status } → 不檢查 email、不查 role、用 updateMember（非 saveMemberWithPassword）', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      status: false,
    });

    expect(mockLoadMember.existsByEmail).not.toHaveBeenCalled();
    expect(mockLoadRole.findRoleById).not.toHaveBeenCalled();
    expect(mockSaveMember.updateMember).toHaveBeenCalledTimes(1);
    expect(mockSaveMember.saveMemberWithPassword).not.toHaveBeenCalled();
    // status=false → 寫入時 domain 已被 deactivate
    const savedMember = mockSaveMember.updateMember.mock.calls[0][0];
    expect(savedMember.status).toBe(false);
  });

  it('只送 { member } → 沿用現況 roleId 呼叫 updateProfile', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      member: 'Renamed',
    });

    expect(mockSaveMember.updateMember).toHaveBeenCalledTimes(1);
    const savedMember = mockSaveMember.updateMember.mock.calls[0][0];
    expect(savedMember.member).toBe('Renamed');
    expect(savedMember.roleId).toBe(ROLE_ID); // 維持原 roleId
  });

  it('只送 { roleId } → 沿用現況 member 名稱呼叫 updateProfile', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      roleId: NEW_ROLE_ID,
    });

    const savedMember = mockSaveMember.updateMember.mock.calls[0][0];
    expect(savedMember.member).toBe('Target'); // 維持原 member
    expect(savedMember.roleId).toBe(NEW_ROLE_ID);
  });

  it('只送 { email } → 檢查 email 唯一，不查 role', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      email: 'new@test.com',
    });

    expect(mockLoadMember.existsByEmail).toHaveBeenCalledWith(
      'new@test.com',
      MEMBER_ID,
    );
    expect(mockLoadRole.findRoleById).not.toHaveBeenCalled();
    const savedMember = mockSaveMember.updateMember.mock.calls[0][0];
    expect(savedMember.email.toString()).toBe('new@test.com');
  });

  it('改密碼但未換角色 → 用現況 roleId 查 roleCode 套政策', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      password: 'NewPass1234',
    });

    // 用 member 現況 roleId 查 role，不是新 roleId
    expect(mockLoadRole.findRoleById).toHaveBeenCalledWith(ROLE_ID);
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass1234', 10);
    expect(mockSaveMember.saveMemberWithPassword).toHaveBeenCalledTimes(1);
    expect(mockSaveMember.updateMember).not.toHaveBeenCalled();
  });

  it('改密碼 + 換角色 → 用新 roleId 查 roleCode，role 只查一次', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      roleId: NEW_ROLE_ID,
      password: 'NewPass1234',
    });

    expect(mockLoadRole.findRoleById).toHaveBeenCalledTimes(1);
    expect(mockLoadRole.findRoleById).toHaveBeenCalledWith(NEW_ROLE_ID);
    expect(mockSaveMember.saveMemberWithPassword).toHaveBeenCalledTimes(1);
  });

  it('password 為空字串（schema 轉 undefined）→ 不改密碼', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      member: 'Renamed',
      password: undefined,
    });

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(mockSaveMember.saveMemberWithPassword).not.toHaveBeenCalled();
    expect(mockSaveMember.updateMember).toHaveBeenCalledTimes(1);
  });

  // ── 防護：邊界錯誤 ────────────────────────────

  it('member 不存在 → MemberNotFoundException', async () => {
    mockLoadMember.loadMemberDomainById.mockResolvedValue(null);

    await expect(
      makeService().execute({
        id: MEMBER_ID,
        actorId: ACTOR_ID,
        member: 'x',
      }),
    ).rejects.toThrow(MemberNotFoundException);
  });

  it('預設帳號 → DefaultMemberNotEditableException', async () => {
    mockLoadMember.loadMemberDomainById.mockResolvedValue(
      makeMember({ isDefault: true }),
    );

    await expect(
      makeService().execute({
        id: MEMBER_ID,
        actorId: ACTOR_ID,
        status: false,
      }),
    ).rejects.toThrow(DefaultMemberNotEditableException);
  });

  it('自停 → CannotDisableSelfException（不走後續查詢）', async () => {
    await expect(
      makeService().execute({
        id: ACTOR_ID,
        actorId: ACTOR_ID,
        status: false,
      }),
    ).rejects.toThrow(CannotDisableSelfException);

    expect(mockLoadMember.loadMemberDomainById).not.toHaveBeenCalled();
  });

  it('email 重複 → EmailAlreadyExistsException', async () => {
    mockLoadMember.existsByEmail.mockResolvedValue(true);

    await expect(
      makeService().execute({
        id: MEMBER_ID,
        actorId: ACTOR_ID,
        email: 'dup@test.com',
      }),
    ).rejects.toThrow(EmailAlreadyExistsException);

    expect(mockSaveMember.updateMember).not.toHaveBeenCalled();
  });

  it('roleId 不存在 → RoleNotFoundException', async () => {
    mockLoadRole.findRoleById.mockResolvedValue(null);

    await expect(
      makeService().execute({
        id: MEMBER_ID,
        actorId: ACTOR_ID,
        roleId: NEW_ROLE_ID,
      }),
    ).rejects.toThrow(RoleNotFoundException);

    expect(mockSaveMember.updateMember).not.toHaveBeenCalled();
  });

  // ── 副作用 ──────────────────────────────────

  it('成功更新後清除 MemberContext 快取', async () => {
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
      status: true,
    });

    expect(mockClearMemberContext.clearMemberContext).toHaveBeenCalledWith(
      MEMBER_ID,
    );
  });

  it('全空 body（無任何更動欄位）→ 仍呼叫 updateMember + 清快取', async () => {
    // 雖然前端正常不會送空 body，但 service 不應 crash
    await makeService().execute({
      id: MEMBER_ID,
      actorId: ACTOR_ID,
    });

    expect(mockSaveMember.updateMember).toHaveBeenCalledTimes(1);
    expect(mockClearMemberContext.clearMemberContext).toHaveBeenCalledWith(
      MEMBER_ID,
    );
  });
});
