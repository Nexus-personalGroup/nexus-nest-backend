import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  REINSTATE_FRONT_USER_USE_CASE,
  FrontUserSuspensionCommand,
  ReinstateFrontUserUseCase,
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
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { REINSTATE_FRONT_USER_USE_CASE };

/**
 * 審閱側的解除停權。
 *
 * **不推播任何事件、也不恢復任何連線**：被停權者的連線早已斷開、token 也失效了，
 * 沒有任何管道推得到他。他重新登入即可。
 */
@Injectable()
export class ReinstateFrontUserService implements ReinstateFrontUserUseCase {
  private readonly logger = new Logger(ReinstateFrontUserService.name);

  constructor(
    @Inject(LOAD_USER_PORT)
    private readonly loadUser: LoadUserPort,
    @Inject(SAVE_USER_PORT)
    private readonly saveUser: SaveUserPort,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  /**
   * 解除某前台使用者的停權
   *
   * @param command - 對象與執行者
   * @throws MemberNotFoundException 該前台使用者不存在
   */
  async execute(command: FrontUserSuspensionCommand): Promise<void> {
    const { userId, moderatorId } = command;

    const user = await this.loadUser.loadById(userId);
    if (!user) throw new MemberNotFoundException(userId);

    const changed = await this.saveUser.reinstate(userId);
    // 本來就是啟用狀態——沒有狀態變化就沒有可記的事
    if (!changed) return;

    // **解除也要留稽核**：停權與解除都是權力的行使，
    // 而反覆停權再解除本身就是可疑的行為模式——只有兩邊都記才看得出來
    await this.audit
      .record({
        memberId: moderatorId,
        action: 'MEMBER_REINSTATED',
        targetMemberId: userId,
      })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));
  }
}
