import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  LogoutCommand,
  LogoutUseCase,
} from '../../../port/in/admin/auth/LogoutUseCase';
import {
  TOKEN_BLACKLIST_PORT,
  TokenBlacklistPort,
} from '../../../port/out/auth/TokenBlacklistPort';
import {
  CLEAR_MEMBER_CONTEXT_PORT,
  ClearMemberContextPort,
} from '../../../port/out/member/ClearMemberContextPort';
import {
  SAVE_AUTH_LOG_PORT,
  SaveAuthLogPort,
} from '../../../port/out/auth/SaveAuthLogPort';
import { FeatureFlagService } from '../../shared/FeatureFlagService';
import { JwtPayload } from '../../../port/jwt-payload';
import { getEnv } from '@app/infrastructure/validate-env';

/**
 * 登出處理：將 access / refresh 同時加入黑名單，並清除 MemberContext 快取
 */
@Injectable()
export class LogoutService implements LogoutUseCase {
  private readonly logger = new Logger(LogoutService.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(TOKEN_BLACKLIST_PORT)
    private readonly tokenBlacklist: TokenBlacklistPort,
    @Inject(CLEAR_MEMBER_CONTEXT_PORT)
    private readonly clearMemberContext: ClearMemberContextPort,
    @Inject(SAVE_AUTH_LOG_PORT)
    private readonly saveAuthLog: SaveAuthLogPort,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    const env = getEnv();

    // 驗證並黑名單 access token
    const accessPayload = this.verifySilently(command.accessToken, {
      secret: env.ACCESS_SECRET,
    });
    if (accessPayload) {
      const ttl = this.computeTtl(accessPayload, env.ACCESS_TOKEN_EXPIRES_IN);
      if (ttl > 0) {
        await this.tokenBlacklist.addToBlacklist(
          command.accessToken,
          ttl,
          'logout',
        );
      }
      await this.clearMemberContext.clearMemberContext(accessPayload.sub);

      await this.logAuth(command, accessPayload.sub);
    }

    // 若 refresh token 一併提供則同樣處理
    if (command.refreshToken && env.REFRESH_SECRET) {
      const refreshPayload = this.verifySilently(command.refreshToken, {
        secret: env.REFRESH_SECRET,
      });
      if (refreshPayload) {
        const ttl = this.computeTtl(
          refreshPayload,
          env.REFRESH_TOKEN_EXPIRES_IN,
        );
        if (ttl > 0) {
          await this.tokenBlacklist.addToBlacklist(
            command.refreshToken,
            ttl,
            'logout',
          );
        }
      } else {
        this.logger.debug('Refresh token 驗證失敗（略過）');
      }
    }
  }

  /** 記錄 LOGOUT auth log（FeatureFlag 控制） */
  private async logAuth(
    command: LogoutCommand,
    memberId: string,
  ): Promise<void> {
    if (!this.featureFlags.isEnabled('authLogEnabled')) return;
    try {
      await this.saveAuthLog.saveAuthLog({
        memberId,
        email: command.email ?? '',
        action: 'LOGOUT',
        ipAddress: command.ip,
        userAgent: command.userAgent,
      });
    } catch (err) {
      this.logger.error('登出日誌寫入失敗', err);
    }
  }

  /** JWT 驗證失敗回傳 null（登出採 best-effort，不拋例外） */
  private verifySilently(
    token: string,
    options: { secret: string },
  ): JwtPayload | null {
    try {
      return this.jwtService.verify<JwtPayload>(token, options);
    } catch {
      return null;
    }
  }

  private computeTtl(payload: JwtPayload, fallback: number): number {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp ? payload.exp - now : fallback;
  }
}
