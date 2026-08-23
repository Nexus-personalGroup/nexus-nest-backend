import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_FRONT_USERS_USE_CASE,
  ListFrontUsersQuery,
  ListFrontUsersResult,
  ListFrontUsersUseCase,
} from '@app/application/port/in/admin/front-user/FrontUserQueryUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_FRONT_USERS_USE_CASE };

/**
 * 後台的前台使用者列表。
 *
 * **本 service 刻意不注入稽核 port**：回應不含任何訊息內容，
 * 記了會讓稽核量與「點了幾下」對齊，而不是與「看到了什麼」對齊。
 * 判準與審閱側的檢舉佇列一致。
 */
@Injectable()
export class ListFrontUsersService implements ListFrontUsersUseCase {
  constructor(
    @Inject(LOAD_USER_PORT)
    private readonly loadUser: LoadUserPort,
  ) {}

  async execute(query: ListFrontUsersQuery): Promise<ListFrontUsersResult> {
    const { page, limit } = getPagination(query);
    const { data, total } = await this.loadUser.listUsers({
      page,
      limit,
      email: query.email,
      displayName: query.displayName,
      status: query.status,
      verified: query.verified,
    });

    return { list: data, meta: buildPaginationMeta(page, limit, total) };
  }
}
