import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  RESOLVE_MEMBER_CONTEXT_USE_CASE,
  ResolveMemberContextUseCase,
} from '@app/application/port/in/shared/ResolveMemberContextUseCase';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { MemberContext } from '@app/application/port/member-context';
import { getEnv } from '@app/infrastructure/validate-env';
import { addMonths } from '@app/infrastructure/date';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { PasswordChangeRequiredException } from '@app/domain/exception/PasswordChangeRequiredException';

/**
 * 全域認證 Guard（APP_GUARD）。
 * - `@Public()` 標記的路由與 `/api/metrics` 跳過認證。
 * - token 的驗證與 MemberContext 解析委由 `ResolveMemberContextUseCase`——
 *   WebSocket 的連線認證呼叫的是同一個實作，避免兩條路徑的判定邏輯分歧。
 * - 本 Guard 只保留 HTTP 專屬的部分：路由層級的豁免、從 header 取 token、
 *   密碼到期導流（WS 沒有對應的處置流程，故不下沉到共用層）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RESOLVE_MEMBER_CONTEXT_USE_CASE)
    private readonly resolveMemberContext: ResolveMemberContextUseCase,
    private readonly featureFlags: FeatureFlagService,
  ) {}

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
    // **精確比對而非前綴**：`startsWith` 的性質是「未來新增的任何 /api/metrics 開頭
    // 路由自動免認證」，而那不會有任何錯誤訊息提醒你——它是一條會自己長大的豁免。
    // 去掉 query string：Prometheus 帶參數 scrape 時仍須通過
    if (url.split('?')[0] === '/api/metrics') return true;

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('缺少授權憑證，請先登入');
    }

    const memberContext = await this.resolveMemberContext.resolve(token);
    request.member = memberContext;
    this.checkPasswordExpiry(memberContext);
    return true;
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
