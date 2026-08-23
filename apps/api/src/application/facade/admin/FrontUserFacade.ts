import { Inject, Injectable } from '@nestjs/common';
import {
  GET_FRONT_USER_USE_CASE,
  GetFrontUserUseCase,
  LIST_FRONT_USERS_USE_CASE,
  ListFrontUsersQuery,
  ListFrontUsersResult,
  ListFrontUsersUseCase,
} from '@app/application/port/in/admin/front-user/FrontUserQueryUseCases';
import {
  FORCE_LOGOUT_FRONT_USER_USE_CASE,
  ForceLogoutFrontUserUseCase,
} from '@app/application/port/in/admin/front-user/ForceLogoutFrontUserUseCase';
import {
  REINSTATE_FRONT_USER_USE_CASE,
  ReinstateFrontUserUseCase,
  SUSPEND_FRONT_USER_USE_CASE,
  SuspendFrontUserUseCase,
} from '@app/application/port/in/admin/moderation/FrontUserSuspensionUseCases';
import type { UserDetailDto } from '@app/application/port/out/user/LoadUserPort';

/**
 * 後台的前台會員管理。
 *
 * **停權與解除注入的是審閱側既有的 use case**，不是另一份實作。
 * 兩個入口分開的是**授權**而不是**行為**——各自實作會讓斷線與稽核分歧，
 * 而分歧的那一邊不會有人發現。
 */
@Injectable()
export class FrontUserFacade {
  constructor(
    @Inject(LIST_FRONT_USERS_USE_CASE)
    private readonly listFrontUsersUseCase: ListFrontUsersUseCase,
    @Inject(GET_FRONT_USER_USE_CASE)
    private readonly getFrontUserUseCase: GetFrontUserUseCase,
    @Inject(SUSPEND_FRONT_USER_USE_CASE)
    private readonly suspendFrontUserUseCase: SuspendFrontUserUseCase,
    @Inject(REINSTATE_FRONT_USER_USE_CASE)
    private readonly reinstateFrontUserUseCase: ReinstateFrontUserUseCase,
    @Inject(FORCE_LOGOUT_FRONT_USER_USE_CASE)
    private readonly forceLogoutFrontUserUseCase: ForceLogoutFrontUserUseCase,
  ) {}

  listFrontUsers(query: ListFrontUsersQuery): Promise<ListFrontUsersResult> {
    return this.listFrontUsersUseCase.execute(query);
  }

  getFrontUser(userId: string): Promise<UserDetailDto> {
    return this.getFrontUserUseCase.execute(userId);
  }

  suspend(userId: string, actorId: string): Promise<void> {
    return this.suspendFrontUserUseCase.execute({
      userId,
      moderatorId: actorId,
    });
  }

  reinstate(userId: string, actorId: string): Promise<void> {
    return this.reinstateFrontUserUseCase.execute({
      userId,
      moderatorId: actorId,
    });
  }

  forceLogout(userId: string, actorId: string): Promise<void> {
    return this.forceLogoutFrontUserUseCase.execute({
      userId,
      moderatorId: actorId,
    });
  }
}
