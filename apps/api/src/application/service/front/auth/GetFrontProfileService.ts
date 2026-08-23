import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  GET_FRONT_PROFILE_USE_CASE,
  FrontProfile,
  GetFrontProfileUseCase,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';

export { GET_FRONT_PROFILE_USE_CASE };

/**
 * `/api/front/me`
 *
 * 回應**只有公開欄位**——不含 `password`、`tokenVersion`，
 * 也不含任何後台概念（角色、權限碼），前台使用者沒有那些東西。
 */
@Injectable()
export class GetFrontProfileService implements GetFrontProfileUseCase {
  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
  ) {}

  async execute(userId: string): Promise<FrontProfile> {
    const user = await this.loadUser.loadById(userId);
    // 走到這裡代表 token 剛通過驗證，查不到只可能是這期間被刪除
    if (!user) throw new UnauthorizedException('使用者不存在');

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }
}
