import { Module } from '@nestjs/common';
import {
  REINSTATE_FRONT_USER_USE_CASE,
  SUSPEND_FRONT_USER_USE_CASE,
} from '../../application/port/in/admin/moderation/FrontUserSuspensionUseCases';
import { SuspendFrontUserService } from '../../application/service/admin/moderation/SuspendFrontUserService';
import { ReinstateFrontUserService } from '../../application/service/admin/moderation/ReinstateFrontUserService';
import { UserPersistenceModule } from '../user-persistence.module';
import { SessionRevocationModule } from '../session-revocation.module';
import { ChatRoomCoreModule } from '../chat-room-core.module';

/**
 * 前台使用者的停權／解除。
 *
 * **抽成獨立模組是因為它有兩個入口**：審閱側（`/moderation/members/:id/suspend`，
 * 需 `MODERATION:EDIT`）與會員管理側（`/front-users/:id/suspend`，
 * 需 `FRONT_USER:EDIT`）。兩者分開的是**授權**而不是**行為**——
 * 各自 provide 一份實作會讓斷線與稽核的行為分歧，而分歧的那一邊不會有人發現。
 *
 * 讓其中一個模組 import 另一個也可以，但那會讓會員管理無謂地相依整個審閱模組樹
 * （檢舉 repository、審閱 controller）。抽出來之後兩邊都只拿到需要的東西。
 *
 * 相依：`UserPersistenceModule`（讀寫 `users`）、
 * `SessionRevocationModule`（撤銷 WS 連線）、`ChatRoomCoreModule`（稽核）。
 */
@Module({
  imports: [UserPersistenceModule, SessionRevocationModule, ChatRoomCoreModule],
  providers: [
    { provide: SUSPEND_FRONT_USER_USE_CASE, useClass: SuspendFrontUserService },
    {
      provide: REINSTATE_FRONT_USER_USE_CASE,
      useClass: ReinstateFrontUserService,
    },
  ],
  exports: [SUSPEND_FRONT_USER_USE_CASE, REINSTATE_FRONT_USER_USE_CASE],
})
export class FrontUserSuspensionModule {}
