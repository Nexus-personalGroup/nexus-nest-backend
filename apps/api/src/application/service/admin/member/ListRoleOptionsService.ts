import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_ROLE_OPTIONS_USE_CASE,
  ListRoleOptionsQuery,
  ListRoleOptionsResult,
  ListRoleOptionsUseCase,
} from '../../../port/in/admin/member/ListRoleOptionsUseCase';
import {
  LOAD_ROLE_PORT,
  LoadRolePort,
} from '../../../port/out/role/LoadRolePort';

export { LIST_ROLE_OPTIONS_USE_CASE };

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class ListRoleOptionsService implements ListRoleOptionsUseCase {
  constructor(
    @Inject(LOAD_ROLE_PORT)
    private readonly loadRole: LoadRolePort,
  ) {}

  async execute(query: ListRoleOptionsQuery): Promise<ListRoleOptionsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    // trim 後若空字串視為未提供（與 zod schema 規則對齊）
    const search = query.search?.trim() || undefined;

    const { list, total } = await this.loadRole.listActiveRoles({
      page,
      limit,
      search,
    });

    return {
      list,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
