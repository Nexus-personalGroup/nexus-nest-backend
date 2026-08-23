import { Inject, Injectable } from '@nestjs/common';
import {
  GET_FRONT_USER_USE_CASE,
  GetFrontUserUseCase,
} from '@app/application/port/in/admin/front-user/FrontUserQueryUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
  UserDetailDto,
} from '@app/application/port/out/user/LoadUserPort';
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { GET_FRONT_USER_USE_CASE };

/**
 * 後台的前台使用者詳情。
 *
 * 走 `loadDetailById` 而非 `loadById`：後者帶 password hash（認證流程需要），
 * 顯示路徑用它就等於讓密碼雜湊有機會被送出去。
 */
@Injectable()
export class GetFrontUserService implements GetFrontUserUseCase {
  constructor(
    @Inject(LOAD_USER_PORT)
    private readonly loadUser: LoadUserPort,
  ) {}

  /**
   * 取單一前台使用者的帳號面資料
   *
   * @param userId - 前台使用者 ID
   * @throws MemberNotFoundException 不存在、已軟刪除，或那是一個後台管理員的 ID
   */
  async execute(userId: string): Promise<UserDetailDto> {
    const user = await this.loadUser.loadDetailById(userId);
    if (!user) throw new MemberNotFoundException(userId);
    return user;
  }
}
