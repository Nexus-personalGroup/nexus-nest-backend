import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import {
  SESSION_ACTIVITY_PORT,
  SessionActivityPort,
} from '@app/application/port/out/auth/SessionActivityPort';
import { MemberContext } from '@app/application/port/member-context';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 全域 Guard：檢查認證使用者的 session 是否因閒置而過期。
 * 僅在 sessionIdleEnabled 開啟時生效。
 * 必須在 JwtAuthGuard 之後執行（需要 request.member 存在）。
 * 對未認證的路由（request.member 不存在）直接放行。
 */
@Injectable()
export class SessionIdleGuard implements CanActivate {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    @Inject(SESSION_ACTIVITY_PORT)
    private readonly sessionActivity: SessionActivityPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.featureFlags.isEnabled('sessionIdleEnabled')) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { member?: MemberContext }>();

    // 未認證的路由不檢查閒置
    if (!request.member?.sub) return true;

    const isActive = await this.sessionActivity.isActive(request.member.sub);
    if (!isActive) {
      throw new UnauthorizedException('Session 已因閒置過久而過期，請重新登入');
    }

    // 刷新活動時間
    const timeout = getEnv().APPLICATION_SESSION_IDLE_TIMEOUT;
    await this.sessionActivity.touchActivity(request.member.sub, timeout);

    return true;
  }
}
