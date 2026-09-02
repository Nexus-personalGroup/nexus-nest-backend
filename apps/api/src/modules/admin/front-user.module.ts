import { Module } from '@nestjs/common';
import { FrontUserController } from '../../adapter/in/web/admin/front-user/FrontUserController';
import { FrontUserFacade } from '../../application/facade/admin/FrontUserFacade';
import {
  GET_FRONT_USER_USE_CASE,
  LIST_FRONT_USERS_USE_CASE,
} from '../../application/port/in/admin/front-user/FrontUserQueryUseCases';
import { FORCE_LOGOUT_FRONT_USER_USE_CASE } from '../../application/port/in/admin/front-user/ForceLogoutFrontUserUseCase';
import { ListFrontUsersService } from '../../application/service/admin/front-user/ListFrontUsersService';
import { GetFrontUserService } from '../../application/service/admin/front-user/GetFrontUserService';
import { ForceLogoutFrontUserService } from '../../application/service/admin/front-user/ForceLogoutFrontUserService';
import { UserPersistenceModule } from '../user-persistence.module';
import { SessionRevocationModule } from '../session-revocation.module';
import { ChatRoomCoreModule } from '../chat-room-core.module';
import { FrontUserSuspensionModule } from './front-user-suspension.module';

/**
 * 後台的前台會員管理（路由 `/api/admin/front-users`）。
 *
 * 它解除的是 `add-admin-member-profile` D6 的限制——在它之前，
 * 後台只能**從檢舉點進**某個前台使用者，找不到沒被檢舉過的人。
 *
 * 停權／解除來自 `FrontUserSuspensionModule`：與審閱側是**同一份實作**，
 * 這裡只是多一個授權不同的入口。
 *
 * `SessionRevocationModule` 提供 `REVOKE_MEMBER_SESSIONS_USE_CASE`（強制登出要中止既有連線）、
 * ChatRoomCoreModule 提供 `CHAT_AUDIT_PORT`。
 */
@Module({
  imports: [
    UserPersistenceModule,
    SessionRevocationModule,
    ChatRoomCoreModule,
    FrontUserSuspensionModule,
  ],
  controllers: [FrontUserController],
  providers: [
    { provide: LIST_FRONT_USERS_USE_CASE, useClass: ListFrontUsersService },
    { provide: GET_FRONT_USER_USE_CASE, useClass: GetFrontUserService },
    {
      provide: FORCE_LOGOUT_FRONT_USER_USE_CASE,
      useClass: ForceLogoutFrontUserService,
    },
    FrontUserFacade,
  ],
})
export class FrontUserModule {}
