import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ResetPasswordService } from './ResetPasswordService';
import { PasswordResetTokenPort } from '../../../port/out/auth/PasswordResetTokenPort';
import { LoadMemberPort } from '../../../port/out/member/LoadMemberPort';
import { UpdateMemberPasswordPort } from '../../../port/out/member/UpdateMemberPasswordPort';
import { MemberContextCachePort } from '../../../port/out/member/MemberContextCachePort';
import { SaveAuthLogPort } from '../../../port/out/auth/SaveAuthLogPort';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { FeatureFlagService } from '../../shared/FeatureFlagService';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

let logoutAfterReset = false;
jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    BCRYPT_ROUNDS: 10,
    get APPLICATION_IS_LOGOUT_AFTER_PASSWORD_RESET() {
      return logoutAfterReset;
    },
  }),
}));

const mockResetToken = {
  createToken: jest.fn(),
  claim: jest.fn(),
} as unknown as jest.Mocked<PasswordResetTokenPort>;

const mockLoadMember = {
  loadMemberById: jest.fn(),
  loadMemberByEmail: jest.fn(),
} as unknown as jest.Mocked<LoadMemberPort>;

const mockUpdatePassword = {
  updatePassword: jest.fn(),
} as jest.Mocked<UpdateMemberPasswordPort>;

const mockClearContext = {
  clearByMemberId: jest.fn(),
} as unknown as jest.Mocked<MemberContextCachePort>;

const mockSaveAuthLog = {
  saveAuthLog: jest.fn(),
} as jest.Mocked<SaveAuthLogPort>;

const mockPasswordPolicy = {
  validateOrThrow: jest.fn(),
} as unknown as jest.Mocked<PasswordPolicyService>;

const makeFeatureFlags = (overrides: Partial<Record<string, boolean>> = {}) =>
  ({
    isEnabled: jest.fn((flag: string) => overrides[flag] ?? false),
  }) as unknown as FeatureFlagService;

const makeService = (flags?: FeatureFlagService) =>
  new ResetPasswordService(
    mockResetToken,
    mockLoadMember,
    mockUpdatePassword,
    mockClearContext,
    mockSaveAuthLog,
    mockPasswordPolicy,
    flags ?? makeFeatureFlags(),
  );

beforeEach(() => {
  jest.clearAllMocks();
  logoutAfterReset = false;
  (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
});

describe('ResetPasswordService', () => {
  it('正常流程 → 驗策略、claim、雜湊、更新密碼', async () => {
    mockResetToken.claim.mockResolvedValue({ memberId: 'member-1' });

    await makeService().execute({ token: 'tok', newPassword: 'NewPass1!' });

    expect(mockPasswordPolicy.validateOrThrow).toHaveBeenCalledWith(
      'NewPass1!',
    );
    expect(mockResetToken.claim).toHaveBeenCalledWith('tok');
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass1!', 10);
    expect(mockUpdatePassword.updatePassword).toHaveBeenCalledWith(
      'member-1',
      'hashed-pw',
    );
  });

  it('token 無效（claim 回 null）→ 拋 BadRequestException，不更新密碼', async () => {
    mockResetToken.claim.mockResolvedValue(null);

    await expect(
      makeService().execute({ token: 'bad', newPassword: 'NewPass1!' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockUpdatePassword.updatePassword).not.toHaveBeenCalled();
  });

  it('密碼策略不合 → 在 claim 前就拋出', async () => {
    (mockPasswordPolicy.validateOrThrow as jest.Mock).mockImplementationOnce(
      () => {
        throw new BadRequestException('密碼不合規');
      },
    );

    await expect(
      makeService().execute({ token: 'tok', newPassword: 'weak' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockResetToken.claim).not.toHaveBeenCalled();
  });

  it('啟用「重設後強制登出」→ 清除 MemberContext', async () => {
    logoutAfterReset = true;
    mockResetToken.claim.mockResolvedValue({ memberId: 'member-1' });

    await makeService().execute({ token: 'tok', newPassword: 'NewPass1!' });

    expect(mockClearContext.clearByMemberId).toHaveBeenCalledWith('member-1');
  });

  it('authLog flag 開啟 → 補查 email 並寫入 PASSWORD_RESET 日誌', async () => {
    mockResetToken.claim.mockResolvedValue({ memberId: 'member-1' });
    (mockLoadMember.loadMemberById as jest.Mock).mockResolvedValue({
      email: 'u@test.com',
    });
    const service = makeService(makeFeatureFlags({ authLogEnabled: true }));

    await service.execute({ token: 'tok', newPassword: 'NewPass1!' });

    expect(mockSaveAuthLog.saveAuthLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PASSWORD_RESET',
        memberId: 'member-1',
        email: 'u@test.com',
      }),
    );
  });
});
