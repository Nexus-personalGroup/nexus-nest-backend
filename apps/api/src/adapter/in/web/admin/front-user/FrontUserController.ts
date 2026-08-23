import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FrontUserFacade } from '@app/application/facade/admin/FrontUserFacade';
import type { ListFrontUsersResult } from '@app/application/port/in/admin/front-user/FrontUserQueryUseCases';
import type { UserDetailDto } from '@app/application/port/out/user/LoadUserPort';
import type { MemberContext } from '@app/application/port/member-context';
import { PermissionCode } from '@app/domain/value-object/Role';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { PermissionsGuard } from '../../guard/PermissionsGuard';
import { Permissions } from '../../decorator/permissions.decorator';
import { CurrentMember } from '../../decorator/current-member.decorator';
import {
  listFrontUsersQuerySchema,
  ListFrontUsersQuery,
} from './ListFrontUsersQuery';

/**
 * 後台的**前台會員**管理（`/api/admin/front-users`）。
 *
 * 路徑用 `front-users` 而非 `users`：後台的 namespace 裡單看 `users` 分不出
 * 是「後台使用者」還是「前台使用者」，而讀日誌的人沒有上下文可以推斷。
 *
 * 權限碼是**第三組**（`BACKEND:FRONT_USER:*`），與後台帳號管理
 * （`ACCOUNT`）、檢舉審閱（`MODERATION`）都分開：這一組管的是**客戶名單**，
 * 沿用任一組都會讓一次授權變成兩件事的授權。
 *
 * 停權與解除**與審閱側呼叫同一個 use case**——分開的是授權不是行為。
 */
@Controller('admin/front-users')
@UseGuards(PermissionsGuard)
export class FrontUserController {
  constructor(private readonly frontUserFacade: FrontUserFacade) {}

  @Get()
  @Permissions(PermissionCode.BACKEND_FRONT_USER_VIEW)
  listFrontUsers(
    @Query(new ZodValidationPipe(listFrontUsersQuerySchema))
    query: ListFrontUsersQuery,
  ): Promise<ListFrontUsersResult> {
    return this.frontUserFacade.listFrontUsers(query);
  }

  @Get(':userId')
  @Permissions(PermissionCode.BACKEND_FRONT_USER_VIEW)
  getFrontUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserDetailDto> {
    return this.frontUserFacade.getFrontUser(userId);
  }

  @Post(':userId/suspend')
  @Permissions(PermissionCode.BACKEND_FRONT_USER_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentMember() member: MemberContext,
  ): Promise<void> {
    await this.frontUserFacade.suspend(userId, member.sub);
  }

  @Post(':userId/reinstate')
  @Permissions(PermissionCode.BACKEND_FRONT_USER_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reinstate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentMember() member: MemberContext,
  ): Promise<void> {
    await this.frontUserFacade.reinstate(userId, member.sub);
  }

  /**
   * 強制登出：讓所有裝置失效但**不停用帳號**。
   *
   * 與停權分開的理由見 `ForceLogoutFrontUserUseCase`——用「停權再解除」代替
   * 會在稽核裡留下一筆不實的違規紀錄。
   */
  @Post(':userId/force-logout')
  @Permissions(PermissionCode.BACKEND_FRONT_USER_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async forceLogout(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentMember() member: MemberContext,
  ): Promise<void> {
    await this.frontUserFacade.forceLogout(userId, member.sub);
  }
}
