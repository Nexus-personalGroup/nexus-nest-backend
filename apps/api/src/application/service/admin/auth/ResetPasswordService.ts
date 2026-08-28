import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ResetPasswordCommand,
  ResetPasswordUseCase,
} from '../../../port/in/admin/auth/ResetPasswordUseCase';
import {
  PASSWORD_RESET_TOKEN_PORT,
  PasswordResetTokenPort,
} from '../../../port/out/auth/PasswordResetTokenPort';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  UPDATE_MEMBER_PASSWORD_PORT,
  UpdateMemberPasswordPort,
} from '../../../port/out/member/UpdateMemberPasswordPort';
import {
  MEMBER_CONTEXT_CACHE_PORT,
  MemberContextCachePort,
} from '../../../port/out/member/MemberContextCachePort';
import {
  SAVE_AUTH_LOG_PORT,
  SaveAuthLogPort,
} from '../../../port/out/auth/SaveAuthLogPort';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 重設密碼服務：驗證 token → 驗證密碼策略 → 更新密碼。
 * 若啟用「重設後強制登出」，會清除 MemberContext 快取。
 */
@Injectable()
export class ResetPasswordService implements ResetPasswordUseCase {
  private readonly logger = new Logger(ResetPasswordService.name);

  constructor(
    @Inject(PASSWORD_RESET_TOKEN_PORT)
    private readonly resetToken: PasswordResetTokenPort,
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(UPDATE_MEMBER_PASSWORD_PORT)
    private readonly updatePassword: UpdateMemberPasswordPort,
    @Inject(MEMBER_CONTEXT_CACHE_PORT)
    private readonly memberContextCache: MemberContextCachePort,
    @Inject(SAVE_AUTH_LOG_PORT)
    private readonly saveAuthLog: SaveAuthLogPort,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    // 先驗證密碼策略，避免 claim 成功但密碼不合格時無法再次重試
    this.passwordPolicy.validateOrThrow(command.newPassword);

    // 原子 claim：同步檢查 + 標記已使用，防止同 token 併發重複觸發
    const result = await this.resetToken.claim(command.token);
    if (!result) {
      throw new BadRequestException('重設密碼連結無效或已過期');
    }

    // 雜湊新密碼
    const env = getEnv();
    const passwordHash = await bcrypt.hash(
      command.newPassword,
      env.BCRYPT_ROUNDS,
    );

    // 更新密碼
    await this.updatePassword.updatePassword(result.memberId, passwordHash);

    // 強制登出（清除 MemberContext 快取）
    if (env.APPLICATION_IS_LOGOUT_AFTER_PASSWORD_RESET) {
      await this.memberContextCache.clearByMemberId(result.memberId);
    }

    // 記錄日誌：audit 表的核心價值是「事件當下的快照」，email 不該事後 join，故在此補查
    if (this.featureFlags.isEnabled('authLogEnabled')) {
      try {
        const member = await this.loadMember.loadMemberById(result.memberId);
        await this.saveAuthLog.saveAuthLog({
          memberId: result.memberId,
          email: member?.email ?? '',
          action: 'PASSWORD_RESET',
          detail: '密碼已重設',
        });
      } catch (err) {
        this.logger.error('密碼重設日誌寫入失敗', err);
      }
    }
  }
}
