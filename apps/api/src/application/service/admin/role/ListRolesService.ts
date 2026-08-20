import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_ROLES_USE_CASE,
  ListRolesQuery,
  ListRolesResult,
  ListRolesUseCase,
} from '../../../port/in/admin/role/ListRolesUseCase';
import {
  ROLE_REPOSITORY_PORT,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_ROLES_USE_CASE };

@Injectable()
export class ListRolesService implements ListRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY_PORT)
    private readonly roleRepo: RoleRepositoryPort,
  ) {}

  async execute(query: ListRolesQuery): Promise<ListRolesResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    const { data, total } = await this.roleRepo.listRoles({
      page,
      limit,
      name: query.name,
      status: query.status,
    });
    return {
      list: data.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        isDefault: r.isDefault,
        memberCount: r.memberCount,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }
}
