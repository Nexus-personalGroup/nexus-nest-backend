import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  FRONT_LOGIN_USE_CASE,
  FrontLoginCommand,
  FrontLoginResult,
  FrontLoginUseCase,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
  UserRecordDto,
} from '@app/application/port/out/user/LoadUserPort';
import { JwtPayload } from '@app/application/port/jwt-payload';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { getEnv } from '@app/infrastructure/validate-env';

export { FRONT_LOGIN_USE_CASE };

/**
 * 帳號不存在時用來抹平回應時間差的 hash。
 *
 * cost 必須與 `BCRYPT_ROUNDS` 一致，否則比對耗時對不上、時間差依然存在——
 * 這正是這個防護唯一會失效的方式。不在模組載入時算，是因為那早於 dotenv。
 */
let cachedDummyHash: string | null = null;
const dummyHash = (): string => {
  cachedDummyHash ??= bcrypt.hashSync(
    'timing-equalizer',
    getEnv().BCRYPT_ROUNDS,
  );
  return cachedDummyHash;
};

/**
 * 前台登入。
 *
 * **刻意不實作帳號鎖定。** `members` 那套（`failedLoginCount` + `lockedAt`）
 * 在 `fix-unauthenticated-surface` 被證明是一個未認證者可以觸發的 DoS 面——
 * 知道 email 就能把人鎖住，而它一度沒有復原路徑。
 * 前台的暴力破解防護交給全域 throttle 與 `APPLICATION_IP_BLOCK_THRESHOLD`：
 * per-IP 而非 per-account，那本來就是對的層級。
 */
@Injectable()
export class FrontLoginService implements FrontLoginUseCase {
  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    private readonly jwtService: JwtService,
  ) {}

  async execute(command: FrontLoginCommand): Promise<FrontLoginResult> {
    const email = command.email.trim().toLowerCase();
    const user = await this.loadUser.loadByEmail(email);

    if (!user) {
      // 帳號不存在時仍跑一次 bcrypt，抹平與「帳號存在但密碼錯」的耗時差距。
      // 訊息已統一，但少了這一步，兩條路徑的時間差穩定可測，足以用來列舉帳號
      await bcrypt.compare(command.password, dummyHash());
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    const isMatch = await bcrypt.compare(command.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // 狀態檢查排在密碼比對**之後**：先檢查的話，「這個帳號被停權了」
    // 會變成一個不需要密碼就能問出來的事實
    if (!user.status) {
      throw new AccountDisabledException();
    }

    await this.loadUser.touchLastSeen(user.id);

    return this.issue(user);
  }

  /**
   * 簽發前台的 token 對
   *
   * **用前台專屬的 secret。** 側別的第一道防線是 secret 而非 payload 裡的 `side`：
   * 某處忘了比對 side 時，前者的後果是簽章驗證失敗（fail-closed），
   * 後者的後果是跨側存取。
   */
  private issue(user: UserRecordDto): FrontLoginResult {
    const env = getEnv();
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
