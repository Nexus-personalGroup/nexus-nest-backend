import { Module, forwardRef } from '@nestjs/common';
import { MemberController } from '../../adapter/in/web/admin/member/MemberController';
import { ProfileController } from '../../adapter/in/web/admin/profile/ProfileController';
import { MemberFacade } from '../../application/facade/admin/MemberFacade';
import { ListMembersService } from '../../application/service/admin/member/ListMembersService';
import { GetMemberService } from '../../application/service/admin/member/GetMemberService';
import {
  CreateMemberService,
  BCRYPT_ROUNDS,
} from '../../application/service/admin/member/CreateMemberService';
import { UpdateMemberService } from '../../application/service/admin/member/UpdateMemberService';
import { DeleteMemberService } from '../../application/service/admin/member/DeleteMemberService';
import { ListRoleOptionsService } from '../../application/service/admin/member/ListRoleOptionsService';
import { GetRoleOptionService } from '../../application/service/admin/member/GetRoleOptionService';
import { PasswordPolicyService } from '../../application/service/shared/PasswordPolicyService';
import { LIST_MEMBERS_USE_CASE } from '../../application/port/in/admin/member/ListMembersUseCase';
import { GET_MEMBER_USE_CASE } from '../../application/port/in/admin/member/GetMemberUseCase';
import { CREATE_MEMBER_USE_CASE } from '../../application/port/in/admin/member/CreateMemberUseCase';
import { UPDATE_MEMBER_USE_CASE } from '../../application/port/in/admin/member/UpdateMemberUseCase';
import { DELETE_MEMBER_USE_CASE } from '../../application/port/in/admin/member/DeleteMemberUseCase';
import { LIST_ROLE_OPTIONS_USE_CASE } from '../../application/port/in/admin/member/ListRoleOptionsUseCase';
import { GET_ROLE_OPTION_USE_CASE } from '../../application/port/in/admin/member/GetRoleOptionUseCase';
import { JwtModule } from '../jwt.module';
import { MemberPersistenceModule } from '../member-persistence.module';
import { SessionRevocationModule } from '../session-revocation.module';
import { ChatRoomCoreModule } from '../chat-room-core.module';
import { RoleModule } from './role.module';
import { getEnv } from '../../infrastructure/validate-env';

@Module({
  // SessionRevocationModule 提供 REVOKE_MEMBER_SESSIONS_USE_CASE（撤銷連線）、
  // ChatRoomCoreModule 提供 CHAT_AUDIT_PORT（停權／解除的稽核）
  imports: [
    JwtModule,
    MemberPersistenceModule,
    SessionRevocationModule,
    ChatRoomCoreModule,
    forwardRef(() => RoleModule),
  ],
  controllers: [MemberController, ProfileController],
  providers: [
    { provide: BCRYPT_ROUNDS, useFactory: () => getEnv().BCRYPT_ROUNDS },
    PasswordPolicyService,
    { provide: LIST_MEMBERS_USE_CASE, useClass: ListMembersService },
    { provide: GET_MEMBER_USE_CASE, useClass: GetMemberService },
    { provide: CREATE_MEMBER_USE_CASE, useClass: CreateMemberService },
    { provide: UPDATE_MEMBER_USE_CASE, useClass: UpdateMemberService },
    { provide: DELETE_MEMBER_USE_CASE, useClass: DeleteMemberService },
    { provide: LIST_ROLE_OPTIONS_USE_CASE, useClass: ListRoleOptionsService },
    { provide: GET_ROLE_OPTION_USE_CASE, useClass: GetRoleOptionService },
    MemberFacade,
  ],
  // 轉出整個模組而非個別 token：Nest 不允許 export 非本模組提供的 provider，
  // 而既有的 import 方仍是向 MemberModule 要這些 port
  exports: [MemberPersistenceModule],
})
export class MemberModule {}
