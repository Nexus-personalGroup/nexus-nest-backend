import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  LOAD_MEMBER_CONTEXT_PORT,
  LoadMemberContextPort,
} from '@app/application/port/out/member/LoadMemberContextPort';
import {
  TOKEN_BLACKLIST_PORT,
  TokenBlacklistPort,
} from '@app/application/port/out/auth/TokenBlacklistPort';
import {
  MEMBER_CONTEXT_CACHE_PORT,
  MemberContextCachePort,
} from '@app/application/port/out/member/MemberContextCachePort';
import { JwtPayload } from '@app/application/port/jwt-payload';
import {
  MemberContext,
  MemberContextSchema,
} from '@app/application/port/member-context';
import { ResolveMemberContextUseCase } from '@app/application/port/in/shared/ResolveMemberContextUseCase';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * token → MemberContext 的單一判定實作
 *
 * 由 HTTP 的 JwtAuthGuard 與 WebSocket 的連線認證共同呼叫。
 * 判定順序刻意如此：黑名單在 JWT 驗證**之前**——已登出的 token 即使簽章仍有效也該擋下，
 * 且 Redis 不可用時要在做任何事之前就 fail-closed。
 */
@Injectable()
export class ResolveMemberContextService implements ResolveMemberContextUseCase {
  private readonly logger = new Logger(ResolveMemberContextService.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
    @Inject(MEMBER_CONTEXT_CACHE_PORT)
    private readonly memberContextCache: MemberContextCachePort,
    @Inject(LOAD_MEMBER_CONTEXT_PORT)
    private readonly loadMemberContext: LoadMemberContextPort,
  ) {}

  /**
   * 驗證 token 並取得會員上下文
   *
   * @param token - access token 原始字串
   * @returns 通過驗證的會員上下文
   */
  async resolve(token: string): Promise<MemberContext> {
    if (await this.tokenBlacklist.isBlacklisted(token)) {
      this.logger.warn('Token 已在黑名單中');
      throw new UnauthorizedException('Token 已登出或失效');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token 驗證失敗');
    }

    // 防止 refresh token 被當 access token 使用
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token 類型不正確');
    }

    // 側別的**第一道**防線是各側各自的 secret：前台簽的 token 在這裡連
    // 簽章都過不了。這一段是第二道，作用是讓錯誤訊息說得出「這是另一側的」。
    //
    // **缺少 side 視為 admin 是有時效的相容措施**：本欄位上線前簽出的 token
    // 沒有它，一律拒絕會讓部署當下所有人被登出。部署時間超過 refresh token
    // 效期（預設 7 天）之後，所有流通中的 token 都會帶 side，
    // 屆時把 `?? 'admin'` 改成 `!== 'admin'` 即可收緊。
    // **沒有這段註解，這個相容會變成永久的後門。**
    if ((payload.side ?? 'admin') !== 'admin') {
      throw new UnauthorizedException('Token 不屬於後台');
    }

    const cached = await this.memberContextCache.getByMemberId(payload.sub);
    if (cached) {
      const context = this.parseCachedContext(cached);
      if (context) {
        if (!context.status) throw new AccountDisabledException();
        this.assertTokenVersion(payload, context.tokenVersion);
        return context;
      }
      // 快取格式不符或內容損毀，fallback 到 DB 查詢並覆寫快取
      this.logger.warn(
        '[ResolveMemberContext] MemberContext 快取無法解析，fallback 到 DB 查詢',
      );
    }

    // 走到這裡代表快取未命中或內容不可用——Redis **本身**不可用的情況
    // 在上方的 isBlacklisted 就已經 throw 503 了（兩者是同一個 client.isOpen），
    // 所以這裡不需要、也不可能是「Redis 掛掉的降級路徑」。
    const data = await this.loadMemberContext.loadMemberContext(payload.sub);
    if (!data) {
      throw new UnauthorizedException('會員不存在');
    }
    if (!data.status) throw new AccountDisabledException();
    this.assertTokenVersion(payload, data.tokenVersion);

    const memberContext: MemberContext = {
      sub: data.id,
      email: data.email,
      roleName: data.roleName,
      roleCode: data.roleCode,
      permissions: data.permissions,
      status: data.status,
      tokenVersion: data.tokenVersion,
      lastPasswordChange: data.lastPasswordChange
        ? data.lastPasswordChange.toISOString()
        : null,
    };

    await this.cacheContext(payload, memberContext);
    return memberContext;
  }

  /**
   * 把查回來的上下文寫入快取
   *
   * TTL 取 token 剩餘效期與權限快取 TTL 的較小值：前者確保快取不會活得比 token 久，
   * 後者確保角色 / 權限變更最多延遲該秒數生效。
   */
  private async cacheContext(
    payload: JwtPayload,
    memberContext: MemberContext,
  ): Promise<void> {
    const env = getEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwtTtl = payload.exp
      ? payload.exp - now
      : env.ACCESS_TOKEN_EXPIRES_IN;
    const ttl = Math.min(jwtTtl, env.PERMISSION_CACHE_TTL);
    if (ttl > 0) {
      await this.memberContextCache.setByMemberId(
        payload.sub,
        JSON.stringify(memberContext),
        ttl,
      );
    }
  }

  /**
   * 解析快取的 MemberContext，無法使用時一律回 null 交由呼叫端走 DB fallback。
   *
   * `safeParse` 只保護 schema 不符，不保護 JSON 語法錯誤——快取若因截斷或編碼問題
   * 不是合法 JSON，`JSON.parse` 會直接拋出並逃出呼叫鏈，兜成 500。而這條路徑服務
   * **所有**已認證的請求與連線，等於全站同時 500，卻正好發生在 fallback 最該生效的時候。
   *
   * @param cached - 快取中的原始字串
   * @returns 可用的 MemberContext；語法錯誤或格式不符時為 null
   */
  private parseCachedContext(cached: string): MemberContext | null {
    try {
      const parsed = MemberContextSchema.safeParse(JSON.parse(cached));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** token 版本比對：payload 帶的版本與 DB 現值不符 → 已被連坐撤銷，拒絕 */
  private assertTokenVersion(
    payload: JwtPayload,
    current: number | undefined,
  ): void {
    if ((payload.tokenVersion ?? 0) !== (current ?? 0)) {
      throw new UnauthorizedException('Token 已失效，請重新登入');
    }
  }
}
