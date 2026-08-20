import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MEMBERS_USE_CASE,
  ListMembersQuery,
  ListMembersResult,
  ListMembersUseCase,
} from '../../port/in/admin/member/ListMembersUseCase';
import {
  GET_MEMBER_USE_CASE,
  GetMemberUseCase,
  MemberDetail,
} from '../../port/in/admin/member/GetMemberUseCase';
import {
  CREATE_MEMBER_USE_CASE,
  CreateMemberCommand,
  CreateMemberResult,
  CreateMemberUseCase,
} from '../../port/in/admin/member/CreateMemberUseCase';
import {
  UPDATE_MEMBER_USE_CASE,
  UpdateMemberCommand,
  UpdateMemberUseCase,
} from '../../port/in/admin/member/UpdateMemberUseCase';
import {
  DELETE_MEMBER_USE_CASE,
  DeleteMemberCommand,
  DeleteMemberUseCase,
} from '../../port/in/admin/member/DeleteMemberUseCase';
import {
  LIST_ROLE_OPTIONS_USE_CASE,
  ListRoleOptionsQuery,
  ListRoleOptionsResult,
  ListRoleOptionsUseCase,
  RoleOptionItem,
} from '../../port/in/admin/member/ListRoleOptionsUseCase';
import {
  GET_ROLE_OPTION_USE_CASE,
  GetRoleOptionUseCase,
} from '../../port/in/admin/member/GetRoleOptionUseCase';
import {
  LOAD_MEMBER_CONTEXT_PORT,
  LoadMemberContextPort,
} from '../../port/out/member/LoadMemberContextPort';

export interface ProfileDetail extends MemberDetail {
  permissionCodes: string[];
  /**
   * 角色代碼（role.role_code，如 SUPERADMIN）；給前端 sidebar 粗粒度 role gate 用。
   * context 取不到時為 null（避免空字串哨值）
   */
  roleCode: string | null;
}

@Injectable()
export class MemberFacade {
  constructor(
    @Inject(LIST_MEMBERS_USE_CASE)
    private readonly listMembersUseCase: ListMembersUseCase,
    @Inject(GET_MEMBER_USE_CASE)
    private readonly getMemberUseCase: GetMemberUseCase,
    @Inject(CREATE_MEMBER_USE_CASE)
    private readonly createMemberUseCase: CreateMemberUseCase,
    @Inject(UPDATE_MEMBER_USE_CASE)
    private readonly updateMemberUseCase: UpdateMemberUseCase,
    @Inject(DELETE_MEMBER_USE_CASE)
    private readonly deleteMemberUseCase: DeleteMemberUseCase,
    @Inject(LIST_ROLE_OPTIONS_USE_CASE)
    private readonly listRoleOptionsUseCase: ListRoleOptionsUseCase,
    @Inject(GET_ROLE_OPTION_USE_CASE)
    private readonly getRoleOptionUseCase: GetRoleOptionUseCase,
    @Inject(LOAD_MEMBER_CONTEXT_PORT)
    private readonly loadMemberContextPort: LoadMemberContextPort,
  ) {}

  listMembers(query: ListMembersQuery): Promise<ListMembersResult> {
    return this.listMembersUseCase.execute(query);
  }

  getMember(id: string): Promise<MemberDetail> {
    return this.getMemberUseCase.execute(id);
  }

  createMember(command: CreateMemberCommand): Promise<CreateMemberResult> {
    return this.createMemberUseCase.execute(command);
  }

  updateMember(command: UpdateMemberCommand): Promise<void> {
    return this.updateMemberUseCase.execute(command);
  }

  deleteMember(command: DeleteMemberCommand): Promise<void> {
    return this.deleteMemberUseCase.execute(command);
  }

  listRoleOptions(query: ListRoleOptionsQuery): Promise<ListRoleOptionsResult> {
    return this.listRoleOptionsUseCase.execute(query);
  }

  getRoleOption(id: string): Promise<RoleOptionItem> {
    return this.getRoleOptionUseCase.execute(id);
  }

  async getMyProfile(id: string): Promise<ProfileDetail> {
    const [detail, context] = await Promise.all([
      this.getMemberUseCase.execute(id),
      this.loadMemberContextPort.loadMemberContext(id),
    ]);
    return {
      ...detail,
      permissionCodes: context?.permissions ?? [],
      roleCode: context?.roleCode ?? null,
    };
  }
}
