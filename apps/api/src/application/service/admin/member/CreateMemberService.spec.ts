import * as bcrypt from 'bcrypt';
import { CreateMemberService } from './CreateMemberService';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { SaveMemberPort } from '../../../port/out/member/SaveMemberPort';
import { LoadRolePort } from '../../../port/out/role/LoadRolePort';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
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

const ROLE_ID = '00000000-0000-0000-0000-000000000002';

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

const makePasswordPolicy = () => {
  const svc = new PasswordPolicyService();
  svc.onModuleInit();
  return svc;
};

const makeService = () =>
  new CreateMemberService(
    mockLoadMember,
    mockSaveMember,
    mockLoadRole,
    10,
    makePasswordPolicy(),
  );

describe('CreateMemberService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockLoadMember.existsByEmail as jest.Mock).mockResolvedValue(false);
    (mockLoadRole.findRoleById as jest.Mock).mockResolvedValue({
      id: ROLE_ID,
      name: 'Admin',
      roleCode: null,
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');
    (mockSaveMember.createMember as jest.Mock).mockResolvedValue(undefined);
  });

  it('有效指令 → 建立 member 並回傳 UUID', async () => {
    const result = await makeService().execute({
      email: 'new@test.com',
      member: 'Test User',
      password: 'Password1',
      roleId: ROLE_ID,
    });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(mockSaveMember.createMember).toHaveBeenCalledTimes(1);
  });

  it('Email 已存在 → 拋出 EmailAlreadyExistsException', async () => {
    (mockLoadMember.existsByEmail as jest.Mock).mockResolvedValue(true);

    await expect(
      makeService().execute({
        email: 'dup@test.com',
        member: 'Test',
        password: 'Password1',
        roleId: ROLE_ID,
      }),
    ).rejects.toThrow(EmailAlreadyExistsException);

    expect(mockSaveMember.createMember).not.toHaveBeenCalled();
  });

  it('Role 不存在 → 拋出 RoleNotFoundException', async () => {
    (mockLoadRole.findRoleById as jest.Mock).mockResolvedValue(null);

    await expect(
      makeService().execute({
        email: 'new@test.com',
        member: 'Test',
        password: 'Password1',
        roleId: 'nonexistent-role',
      }),
    ).rejects.toThrow(RoleNotFoundException);

    expect(mockSaveMember.createMember).not.toHaveBeenCalled();
  });

  it('密碼過短（不足 8 字元）→ 驗證失敗，不執行 DB 寫入', async () => {
    await expect(
      makeService().execute({
        email: 'new@test.com',
        member: 'Test',
        password: 'short',
        roleId: ROLE_ID,
      }),
    ).rejects.toThrow();

    expect(mockSaveMember.createMember).not.toHaveBeenCalled();
  });
});
