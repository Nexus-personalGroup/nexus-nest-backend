import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FORCE_LOGOUT_FRONT_USER_USE_CASE,
  ForceLogoutFrontUserCommand,
  ForceLogoutFrontUserUseCase,
} from '@app/application/port/in/admin/front-user/ForceLogoutFrontUserUseCase';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '@app/application/port/out/user/SaveUserPort';
import {
  REVOKE_MEMBER_SESSIONS_USE_CASE,
  RevokeMemberSessionsUseCase,
} from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { FORCE_LOGOUT_FRONT_USER_USE_CASE };

/**
 * 強制登出：讓所有裝置失效，但**不動 `status`**。
 *
 * 三個副作用的順序有意義：先遞增 `tokenVersion`（讓下一次請求就被擋下），
 * 再撤銷既有連線（連線層的認證只在 handshake 執行一次，不主動斷開的話
 * 拿到 token 的人只要連線還開著就能繼續用），最後才寫稽核。
 */
@Injectable()
export class ForceLogoutFrontUserService implements ForceLogoutFrontUserUseCase {
  private readonly logger = new Logger(ForceLogoutFrontUserService.name);

  constructor(
    @Inject(SAVE_USER_PORT)
    private readonly saveUser: SaveUserPort,
    @Inject(REVOKE_MEMBER_SESSIONS_USE_CASE)
    private readonly revokeSessions: RevokeMemberSessionsUseCase,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  /**
   * 強制某前台使用者的所有裝置登出
   *
   * @param command - 對象與執行者
   * @throws MemberNotFoundException 該前台使用者不存在或已軟刪除
   */
  async execute(command: ForceLogoutFrontUserCommand): Promise<void> {
    const { userId, moderatorId } = command;

    const bumped = await this.saveUser.bumpTokenVersion(userId);
    // 條件式更新沒命中只有一個原因：查無此人（不像停權還有「本來就停用了」）
    if (!bumped) throw new MemberNotFoundException(userId);

    await this.revokeSessions.execute(userId);

    await this.audit
      .record({
        memberId: moderatorId,
        action: 'MEMBER_FORCE_LOGGED_OUT',
        targetMemberId: userId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));
  }
}
