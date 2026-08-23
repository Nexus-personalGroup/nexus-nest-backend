import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  FRONT_REFRESH_TOKEN_USE_CASE,
  FrontLoginResult,
  FrontRefreshTokenUseCase,
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
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { getEnv } from '@app/infrastructure/validate-env';

export { FRONT_REFRESH_TOKEN_USE_CASE };

/**
 * 前台的 token 更新（rotation）。
 *
 * 舊的 refresh token 在換發成功後立即進黑名單——同一枚再次被使用是
 * token 遭竊的訊號，不可靜默放行。
 */
@Injectable()
export class FrontRefreshTokenService implements FrontRefreshTokenUseCase {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
  ) {}

  async execute(refreshToken: string): Promise<FrontLoginResult> {
    const env = getEnv();

    if (await this.tokenBlacklist.isBlacklisted(refreshToken)) {
      throw new UnauthorizedException('Token 已失效，請重新登入');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: env.FRONT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token 驗證失敗');
    }

    // 防止 access token 被當 refresh token 使用
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token 類型不正確');
    }
    // 第二道；第一道是 secret（後台簽的在上面就驗不過了）
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
    if (
      payload.tokenVersion !== undefined &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Token 已失效，請重新登入');
    }

    // rotation：舊的立刻作廢。TTL 只需留到它自然過期為止
    const ttl = payload.exp
      ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
      : env.REFRESH_TOKEN_EXPIRES_IN;
    if (ttl > 0) {
      await this.tokenBlacklist.addToBlacklist(refreshToken, ttl, 'rotated');
    }

    const payloadBase = { sub: user.id, tokenVersion: user.tokenVersion };
    return {
      accessToken: this.jwtService.sign(
        { ...payloadBase, type: 'access', side: 'front' } satisfies JwtPayload,
        {
          secret: env.FRONT_ACCESS_SECRET,
          expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
        },
      ),
      refreshToken: this.jwtService.sign(
        { ...payloadBase, type: 'refresh', side: 'front' } satisfies JwtPayload,
        {
          secret: env.FRONT_REFRESH_SECRET,
          expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
        },
      ),
      accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
