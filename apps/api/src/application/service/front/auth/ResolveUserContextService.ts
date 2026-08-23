import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  RESOLVE_USER_CONTEXT_USE_CASE,
  ResolveUserContextUseCase,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  TOKEN_BLACKLIST_PORT,
  TokenBlacklistPort,
} from '@app/application/port/out/auth/TokenBlacklistPort';
import { JwtPayload } from '@app/application/port/jwt-payload';
import { UserContext } from '@app/application/port/user-context';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { getEnv } from '@app/infrastructure/validate-env';

export { RESOLVE_USER_CONTEXT_USE_CASE };

/**
 * token → UserContext 的單一判定實作（前台）。
 *
 * 與後台的 `ResolveMemberContextService` **平行而非共用**：後者要查角色與權限碼，
 * 前台一個都沒有。共用一支再用參數分流，會讓「前台要不要查權限」
 * 這種問題每次都要重新想一遍。
 *
 * 判定順序與後台一致：黑名單在 JWT 驗證**之前**——已登出的 token 即使簽章仍有效
 * 也該擋下，且 Redis 不可用時要在做任何事之前就 fail-closed。
 *
 * **目前不做快取。** 後台快取 MemberContext 是因為它要 join 角色與權限；
 * 前台只查一張表的幾個欄位，加一層快取換來的是「權限撤銷延遲」這類問題的前台版本，
 * 而收益量測不出來。等真的量到再說。
 */
@Injectable()
export class ResolveUserContextService implements ResolveUserContextUseCase {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
  ) {}

  async resolve(token: string): Promise<UserContext> {
    if (await this.tokenBlacklist.isBlacklisted(token)) {
      throw new UnauthorizedException('Token 已登出或失效');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: getEnv().FRONT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token 驗證失敗');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token 類型不正確');
    }

    // 第二道。第一道是 secret——後台簽的 token 在上面的 verify 就過不了了。
    // 這一段的作用是讓錯誤訊息說得出「這是另一側的」而不是只有「簽章無效」。
    // 前台不需要「缺少 side 視為前台」的相容：前台 secret 是新的，
    // 用它簽出的 token 從第一天就一定帶 side
    if (payload.side !== 'front') {
      throw new UnauthorizedException('Token 不屬於前台');
    }

    const user = await this.loadUser.loadById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('使用者不存在');
    }
    if (!user.status) {
      throw new AccountDisabledException();
    }
    // 立即撤銷的唯一機制：改密碼、強制登出時 tokenVersion +1
    if (
      payload.tokenVersion !== undefined &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Token 已失效，請重新登入');
    }

    return {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      // 每次解析都重算：驗證完之後同一個 token 就該立刻能聊天
      emailVerified: user.emailVerifiedAt !== null,
      tokenVersion: user.tokenVersion,
    };
  }
}
