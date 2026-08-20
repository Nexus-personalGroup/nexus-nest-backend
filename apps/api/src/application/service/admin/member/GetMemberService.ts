import { Inject, Injectable } from '@nestjs/common';
import {
  GET_MEMBER_USE_CASE,
  GetMemberUseCase,
  MemberDetail,
} from '../../../port/in/admin/member/GetMemberUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { GET_MEMBER_USE_CASE };

@Injectable()
export class GetMemberService implements GetMemberUseCase {
  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
  ) {}

  async execute(id: string): Promise<MemberDetail> {
    const r = await this.loadMember.loadMemberById(id);
    if (!r) throw new MemberNotFoundException();
    return {
      id: r.id,
      email: r.email,
      member: r.member,
      roleId: r.roleId,
      roleName: r.roleName,
      status: r.status,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastLoginAt: r.lastLoginAt,
    };
  }
}
