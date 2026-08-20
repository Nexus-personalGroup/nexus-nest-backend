import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
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
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { JwtPayload } from '@app/application/port/jwt-payload';
import { getEnv } from '@app/infrastructure/validate-env';
import { addMonths } from '@app/infrastructure/date';
import {
  MemberContext,
  MemberContextSchema,
} from '../decorator/current-member.decorator';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { AccountDisabledException } from '@app/domain/exception/AccountDisabledException';
import { PasswordChangeRequiredException } from '@app/domain/exception/PasswordChangeRequiredException';

/**
 * 全域認證 Guard（APP_GUARD）。
 * - `@Public()` 標記的路由與 `/api/metrics` 跳過認證。
 * - 驗證 access token、檢查黑名單與帳號狀態，並把 MemberContext 掛到 request。
 * - 比對 payload.tokenVersion 與 DB 現值，攔截被 refresh 重用連坐撤銷的舊 token。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwtExpiresIn = 0;
  private permissionCacheTtl = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
    @Inject(MEMBER_CONTEXT_CACHE_PORT)
    private readonly memberContextCache: MemberContextCachePort,
    @Inject(LOAD_MEMBER_CONTEXT_PORT)
    private readonly loadMemberContext: LoadMemberContextPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  onModuleInit(): void {
    const env = getEnv();
    this.jwtExpiresIn = env.ACCESS_TOKEN_EXPIRES_IN;
    this.permissionCacheTtl = env.PERMISSION_CACHE_TTL;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // @Public() 路由（login / refresh / forgot / reset / health）跳過認證
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Prometheus /api/metrics 由第三方 controller 提供、無法掛 @Public，以路徑略過
    const url = request.originalUrl ?? request.url ?? '';
    if (url.startsWith('/api/metrics')) return true;

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('缺少授權憑證，請先登入');
    }

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

    const cached = await this.memberContextCache.getByMemberId(payload.sub);
    if (cached) {
      const context = this.parseCachedContext(cached);
      if (context) {
        if (!context.status) throw new AccountDisabledException();
        this.assertTokenVersion(payload, context.tokenVersion);
        request.member = context;
        this.checkPasswordExpiry(context);
        return true;
      }
      // 快取格式不符或內容損毀，fallback 到 DB 查詢並覆寫快取
      this.logger.warn(
        '[JwtAuthGuard] MemberContext 快取無法解析，fallback 到 DB 查詢',
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

    request.member = memberContext;

    const now = Math.floor(Date.now() / 1000);
    const jwtTtl = payload.exp ? payload.exp - now : this.jwtExpiresIn;
    const ttl = Math.min(jwtTtl, this.permissionCacheTtl);
    if (ttl > 0) {
      await this.memberContextCache.setByMemberId(
        payload.sub,
        JSON.stringify(memberContext),
        ttl,
      );
    }

    this.checkPasswordExpiry(memberContext);
    return true;
  }

  /**
   * 解析快取的 MemberContext，無法使用時一律回 null 交由呼叫端走 DB fallback。
   *
   * `safeParse` 只保護 schema 不符，不保護 JSON 語法錯誤——快取若因截斷或編碼問題
   * 不是合法 JSON，`JSON.parse` 會直接拋出並逃出 guard，兜成 500。而這是全域 guard，
   * 代表**所有已登入請求同時 500**，卻正好發生在 fallback 最該生效的時候。
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

  private checkPasswordExpiry(member: MemberContext): void {
    if (!this.featureFlags.isEnabled('passwordChangeEnabled')) return;

    const env = getEnv();
    const period = env.APPLICATION_PASSWORD_CHANGE_PERIOD;
    if (period <= 0) return;

    if (!member.lastPasswordChange) {
      throw new PasswordChangeRequiredException();
    }

    // 用 addMonths 而非 setMonth：後者遇月底天數不足會往後溢位
    //（8/31 加 6 個月得到 3/3 而非 2/28），到期日會晚 1～3 天
    const expiryDate = addMonths(new Date(member.lastPasswordChange), period);

    if (new Date() > expiryDate) {
      throw new PasswordChangeRequiredException();
    }
  }

  private readonly extractToken = (request: Request): string | null => {
    const auth = request.headers.authorization;
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  };
}
