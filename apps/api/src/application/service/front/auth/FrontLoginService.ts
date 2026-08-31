import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
import {
  IP_BLOCK_PORT,
  IpBlockPort,
} from '@app/application/port/out/security/IpBlockPort';
import {
  IP_LIST_PORT,
  IpListPort,
} from '@app/application/port/out/security/IpListPort';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
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
 *
 * 暴力破解防護因此走 **per-IP 的兩層**，那本來就是對的層級：
 *
 * 1. **端點層節流**（`@Throttle`，見 `FrontAuthController`）——擋速率
 * 2. **IP 失敗計數 → 自動加入黑名單**（本檔）——擋持續攻擊
 *
 * 兩層都要：節流的窗口一過就重置，擋不住「每分鐘試五次、試一整天」。
 *
 * ⚠️ **這段註解一度描述了一條不存在的防線**：它寫著防護交給
 * `APPLICATION_IP_BLOCK_THRESHOLD`，但 `recordFailedIpAttempt` 從來沒有被前台呼叫過
 * （全專案只有後台 `LoginService` 一個呼叫點）。
 * **描述了不存在防線的註解比沒有註解更危險**——它會讓下一個讀的人
 * 以為事情已經做完了，於是那個缺口永遠不會被補。
 */
@Injectable()
export class FrontLoginService implements FrontLoginUseCase {
  private readonly logger = new Logger(FrontLoginService.name);

  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    private readonly jwtService: JwtService,
    @Inject(IP_BLOCK_PORT) private readonly ipBlock: IpBlockPort,
    @Inject(IP_LIST_PORT) private readonly ipList: IpListPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(command: FrontLoginCommand): Promise<FrontLoginResult> {
    const email = command.email.trim().toLowerCase();
    const user = await this.loadUser.loadByEmail(email);

    if (!user) {
      // 帳號不存在時仍跑一次 bcrypt，抹平與「帳號存在但密碼錯」的耗時差距。
      // 訊息已統一，但少了這一步，兩條路徑的時間差穩定可測，足以用來列舉帳號
      await bcrypt.compare(command.password, dummyHash());
      await this.recordFailure(command.ip);
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    const isMatch = await bcrypt.compare(command.password, user.password);
    if (!isMatch) {
      await this.recordFailure(command.ip);
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // 狀態檢查排在密碼比對**之後**：先檢查的話，「這個帳號被停權了」
    // 會變成一個不需要密碼就能問出來的事實
    if (!user.status) {
      throw new AccountDisabledException();
    }

    await this.loadUser.touchLastSeen(user.id);
    // 成功就把該 IP 的失敗計數歸零，否則零星打錯的使用者會慢慢累積到門檻
    if (command.ip) await this.ipBlock.resetIpAttempts(command.ip);

    return this.issue(user);
  }

  /**
   * 記一次該 IP 的登入失敗，達門檻自動加入黑名單
   *
   * **計數的 key 只有 IP、不分側**（`buildFailedIpKey`），因此後台與前台的失敗
   * 會累加到同一個計數器。**那是對的**——同一個 IP 在兩側輪流試密碼
   * 仍然是同一個攻擊者，分開計數等於給他兩倍的額度。
   *
   * @param ip - 來源 IP；取不到時直接略過（沒有 IP 就沒有可計數的對象）
   */
  private async recordFailure(ip: string | undefined): Promise<void> {
    if (!ip || !this.featureFlags.isEnabled('ipBlacklistEnabled')) return;

    const failCount = await this.ipBlock.recordFailedIpAttempt(ip);
    if (failCount >= getEnv().APPLICATION_IP_BLOCK_THRESHOLD) {
      await this.ipList.addToBlacklist(
        ip,
        `自動封鎖：連續 ${failCount} 次登入失敗`,
        true,
      );
      this.logger.warn(`IP ${ip} 已自動加入黑名單（${failCount} 次失敗）`);
    }
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
        emailVerified: user.emailVerifiedAt !== null,
      },
    };
  }
}
