import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MEMBERS_USE_CASE,
  ListMembersQuery,
  ListMembersResult,
  ListMembersUseCase,
} from '../../../port/in/admin/member/ListMembersUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_MEMBERS_USE_CASE };

@Injectable()
export class ListMembersService implements ListMembersUseCase {
  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
  ) {}

  async execute(query: ListMembersQuery): Promise<ListMembersResult> {
    const { page, limit } = getPagination(query);
    const { data, total } = await this.loadMember.listMembers({
      page,
      limit,
      name: query.name,
      email: query.email,
      status: query.status,
    });
    return {
      list: data.map((r) => ({
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
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }
}
