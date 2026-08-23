import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SUSPEND_FRONT_USER_USE_CASE,
  FrontUserSuspensionCommand,
  SuspendFrontUserUseCase,
} from '@app/application/port/in/admin/moderation/FrontUserSuspensionUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '@app/application/port/out/user/SaveUserPort';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import {
  REVOKE_MEMBER_SESSIONS_USE_CASE,
  RevokeMemberSessionsUseCase,
} from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { SUSPEND_FRONT_USER_USE_CASE };

/**
 * 審閱側的停權：停的是**前台使用者**。
 *
 * **沒有「不可停權自己」的檢查**——那個保護屬於帳號管理側。管理員與前台使用者是
 * 兩個不相交的身分空間，管理員的 ID 在 `users` 裡查不到，
 * 傳進來只會走到下面的 `MemberNotFoundException`。
 */
@Injectable()
export class SuspendFrontUserService implements SuspendFrontUserUseCase {
  private readonly logger = new Logger(SuspendFrontUserService.name);

  constructor(
    @Inject(LOAD_USER_PORT)
    private readonly loadUser: LoadUserPort,
    @Inject(SAVE_USER_PORT)
    private readonly saveUser: SaveUserPort,
    @Inject(REVOKE_MEMBER_SESSIONS_USE_CASE)
    private readonly revokeSessions: RevokeMemberSessionsUseCase,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  /**
   * 停用某前台使用者並中止其既有連線
   *
   * @param command - 對象與執行者
   * @throws MemberNotFoundException 該前台使用者不存在（含「傳入管理員 ID」）
   */
  async execute(command: FrontUserSuspensionCommand): Promise<void> {
    const { userId, moderatorId } = command;

    // 先確認存在：條件式更新的 count 分不出「查無此人」與「本來就停用了」，
    // 而兩者要回的東西不同（404 vs 冪等的 204）
    const user = await this.loadUser.loadById(userId);
    if (!user) throw new MemberNotFoundException(userId);

    const changed = await this.saveUser.suspend(userId);
    // 已經是停用狀態——沒有任何改變，不重複斷線也不重複稽核
    if (!changed) return;

    // 遞增 tokenVersion 只讓「下一次請求」被擋下，既有的 WebSocket 連線不受影響——
    // 連線層的認證只在 handshake 執行一次。不主動撤銷的話，
    // 被停權的人只要連線還開著就能繼續送訊息
    await this.revokeSessions.execute(userId);

    await this.audit
      .record({
        memberId: moderatorId,
        action: 'MEMBER_SUSPENDED',
        targetMemberId: userId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));
  }
}
