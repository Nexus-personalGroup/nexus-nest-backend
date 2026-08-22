import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { AccountLockedException } from '@app/domain/exception/AccountLockedException';
import {
  LoginCommand,
  LoginResult,
  LoginUseCase,
} from '../../../port/in/admin/auth/LoginUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  SAVE_MEMBER_PORT,
  SaveMemberPort,
} from '../../../port/out/member/SaveMemberPort';
import {
  SAVE_AUTH_LOG_PORT,
  SaveAuthLogPort,
} from '../../../port/out/auth/SaveAuthLogPort';
import {
  ACCOUNT_LOCK_PORT,
  AccountLockPort,
} from '../../../port/out/auth/AccountLockPort';
import {
  IP_BLOCK_PORT,
  IpBlockPort,
} from '../../../port/out/security/IpBlockPort';
import {
  IP_LIST_PORT,
  IpListPort,
} from '../../../port/out/security/IpListPort';
import {
  RECAPTCHA_VERIFY_PORT,
  RecaptchaVerifyPort,
} from '../../../port/out/auth/RecaptchaVerifyPort';
import {
  SESSION_ACTIVITY_PORT,
  SessionActivityPort,
} from '../../../port/out/auth/SessionActivityPort';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import { JwtPayload } from '../../../port/jwt-payload';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 抹平時間差用的假 hash（首次使用時計算一次後快取）。
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

@Injectable()
export class LoginService implements LoginUseCase {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(SAVE_MEMBER_PORT)
    private readonly saveMember: SaveMemberPort,
    @Inject(SAVE_AUTH_LOG_PORT)
    private readonly saveAuthLog: SaveAuthLogPort,
    @Inject(ACCOUNT_LOCK_PORT)
    private readonly accountLock: AccountLockPort,
    @Inject(IP_BLOCK_PORT)
    private readonly ipBlock: IpBlockPort,
    @Inject(IP_LIST_PORT)
    private readonly ipList: IpListPort,
    @Inject(RECAPTCHA_VERIFY_PORT)
    private readonly recaptcha: RecaptchaVerifyPort,
    @Inject(SESSION_ACTIVITY_PORT)
    private readonly sessionActivity: SessionActivityPort,
    private readonly jwtService: JwtService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const { email, password, ip, userAgent, recaptchaToken } = command;

    // reCAPTCHA 驗證
    if (this.featureFlags.isEnabled('googleRecaptchaEnabled')) {
      if (!recaptchaToken) {
        throw new UnauthorizedException('請完成 reCAPTCHA 驗證');
      }
      const passed = await this.recaptcha.verify(recaptchaToken, ip);
      if (!passed) {
        throw new UnauthorizedException('reCAPTCHA 驗證失敗');
      }
    }

    // 帳號鎖定檢查
    if (this.featureFlags.isEnabled('accountLockEnabled')) {
      const lockStatus = await this.accountLock.checkLock(email);
      if (lockStatus === 'LOCKED') {
        await this.logAuth(
          email,
          undefined,
          'LOGIN_FAILURE',
          ip,
          userAgent,
          '帳號已鎖定',
        );
        throw new AccountLockedException();
      }
      if (lockStatus === 'EXPIRED') {
        // **到期必須一併清掉失敗計數。** 計數在 Redis 且 TTL（30 分鐘）比鎖定時效長，
        // 不清的話使用者在到期後第一次打錯就會因為「計數還在閾值上」立刻重新被鎖，
        // 實際鎖定時間變成計數的 TTL 而非設定的時效——而設定的那個數字看起來完全正常
        await this.accountLock.resetFailedLogin(email);
      }
    }

    const member = await this.loadMember.loadMemberByEmail(email);
    if (!member) {
      // 帳號不存在時仍跑一次 bcrypt，抹平與「帳號存在但密碼錯」的回應時間差。
      // 訊息已統一為「帳號或密碼錯誤」，但少了這一步，兩條路徑的耗時差距
      // 在 BCRYPT_ROUNDS=12 下約 100ms，穩定可測，足以用來列舉帳號。
      await bcrypt.compare(password, dummyHash());
      await this.handleLoginFailure(email, ip, userAgent, '帳號不存在');
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    const isMatch = await bcrypt.compare(password, member.password);
    if (!isMatch) {
      await this.handleLoginFailure(email, ip, userAgent, '密碼錯誤');
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    // status 檢查（放在 bcrypt 後避免 user enumeration）
    if (!member.status) {
      await this.logAuth(
        email,
        member.id.toString(),
        'LOGIN_FAILURE',
        ip,
        userAgent,
        '帳號已停用',
      );
      throw new AccountDisabledException();
    }

    // 登入成功：重置失敗計數
    if (this.featureFlags.isEnabled('accountLockEnabled')) {
      await this.accountLock.resetFailedLogin(email);
    }
    if (ip) {
      await this.ipBlock.resetIpAttempts(ip);
    }

    const memberId = member.id.toString();
    const env = getEnv();

    // 雙 Token 簽發（雙 secret 分離）；帶 tokenVersion 供 refresh 重用連坐撤銷比對
    const tokenVersion = member.tokenVersion;
    const accessToken = this.jwtService.sign(
      { sub: memberId, type: 'access', tokenVersion } satisfies JwtPayload,
      { secret: env.ACCESS_SECRET, expiresIn: env.ACCESS_TOKEN_EXPIRES_IN },
    );
    const refreshToken = this.jwtService.sign(
      { sub: memberId, type: 'refresh', tokenVersion } satisfies JwtPayload,
      { secret: env.REFRESH_SECRET, expiresIn: env.REFRESH_TOKEN_EXPIRES_IN },
    );

    // 初始化 session 活動追蹤
    if (this.featureFlags.isEnabled('sessionIdleEnabled')) {
      await this.sessionActivity.touchActivity(
        memberId,
        env.APPLICATION_SESSION_IDLE_TIMEOUT,
      );
    }

    // 更新 lastLoginAt（fire-and-forget；DB 寫入失敗不影響登入成功流程）
    this.saveMember.updateLastLoginAt(memberId).catch((err) => {
      this.logger.warn('updateLastLoginAt 失敗', err);
    });

    // 記錄登入成功日誌
    await this.logAuth(email, memberId, 'LOGIN_SUCCESS', ip, userAgent);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
      member: {
        id: memberId,
        email: member.email.toString(),
        member: member.member,
        roleName: member.roleName,
      },
    };
  }

  /**
   * 處理登入失敗：帳號鎖定計數 + IP 封鎖計數 + 日誌
   */
  private async handleLoginFailure(
    email: string,
    ip?: string,
    userAgent?: string,
    detail?: string,
  ): Promise<void> {
    // 帳號失敗計數
    if (this.featureFlags.isEnabled('accountLockEnabled')) {
      const env = getEnv();
      const failCount = await this.accountLock.recordFailedLogin(email);
      if (failCount >= env.APPLICATION_ACCOUNT_LOCK_THRESHOLD) {
        await this.accountLock.lockAccount(email);
        this.logger.warn(`帳號 ${email} 已因連續 ${failCount} 次失敗而鎖定`);
      }
    }

    // IP 失敗計數（需同時啟用帳號鎖定和 IP 黑名單功能）
    if (ip && this.featureFlags.isEnabled('ipBlacklistEnabled')) {
      const env = getEnv();
      const ipFailCount = await this.ipBlock.recordFailedIpAttempt(ip);
      if (ipFailCount >= env.APPLICATION_IP_BLOCK_THRESHOLD) {
        await this.ipList.addToBlacklist(
          ip,
          `自動封鎖：連續 ${ipFailCount} 次登入失敗`,
          true,
        );
        this.logger.warn(`IP ${ip} 已自動加入黑名單（${ipFailCount} 次失敗）`);
      }
    }

    // 記錄失敗日誌
    await this.logAuth(
      email,
      undefined,
      'LOGIN_FAILURE',
      ip,
      userAgent,
      detail,
    );
  }

  /**
   * 條件式記錄登入日誌（FeatureFlag 控制）
   */
  private async logAuth(
    email: string,
    memberId: string | undefined,
    action: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE',
    ip?: string,
    userAgent?: string,
    detail?: string,
  ): Promise<void> {
    if (!this.featureFlags.isEnabled('authLogEnabled')) return;
    try {
      await this.saveAuthLog.saveAuthLog({
        email,
        memberId,
        action,
        ipAddress: ip,
        userAgent,
        detail,
      });
    } catch (err) {
      // fire-and-forget：日誌寫入失敗不影響登入流程
      this.logger.error('登入日誌寫入失敗', err);
    }
  }
}
