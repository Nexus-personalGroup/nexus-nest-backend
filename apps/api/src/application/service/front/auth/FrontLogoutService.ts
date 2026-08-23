import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  FRONT_LOGOUT_USE_CASE,
  FrontLogoutUseCase,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';
import {
  TOKEN_BLACKLIST_PORT,
  TokenBlacklistPort,
} from '@app/application/port/out/auth/TokenBlacklistPort';
import { JwtPayload } from '@app/application/port/jwt-payload';
import { getEnv } from '@app/infrastructure/validate-env';

export { FRONT_LOGOUT_USE_CASE };

/**
 * 前台登出。
 *
 * **沿用既有的 token 黑名單，不開第二套。** 黑名單以 token 本身為鍵，
 * 與哪一側簽發無關——它處理的是 token 這個載體，而不是 token 背後的身分。
 * 這是少數幾個應該共用的東西。
 */
@Injectable()
export class FrontLogoutService implements FrontLogoutUseCase {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
  ) {}

  async execute(accessToken: string): Promise<void> {
    const env = getEnv();

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(accessToken, {
        secret: env.FRONT_ACCESS_SECRET,
      });
    } catch {
      // 已過期或無效的 token 不需要進黑名單——它本來就過不了驗證。
      // 登出仍回成功：讓「登出」這個動作對客戶端永遠是冪等的
      return;
    }

    const ttl = this.remainingTtl(payload, env.ACCESS_TOKEN_EXPIRES_IN);
    if (ttl > 0) {
      await this.tokenBlacklist.addToBlacklist(accessToken, ttl, 'logout');
    }
  }

  /**
   * 黑名單只需要留到 token 自然過期為止
   *
   * @param payload - 已驗證的 payload
   * @param fallbackSeconds - payload 沒有 exp 時的保守值
   */
  private remainingTtl(payload: JwtPayload, fallbackSeconds: number): number {
    if (!payload.exp) return fallbackSeconds;
    return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
  }
}
