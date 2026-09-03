import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import {
  IP_LIST_PORT,
  IpListPort,
} from '@app/application/port/out/security/IpListPort';
import { isInfraEndpoint } from './infra-endpoint';

/**
 * 全域 Guard：當 IP 黑名單功能啟用時，檢查請求來源 IP 是否在黑名單中。
 * 功能關閉時直接放行。
 *
 * 基礎設施探針（健康檢查 / 指標）不受限制——理由同白名單。
 * ⚠️ 豁免的判準是 `@InfraEndpoint()`，**不是 `@Public()`**：
 * 登入端點也是 `@Public()`，而擋惡意來源打登入正是黑名單存在的主要理由。
 */
@Injectable()
export class IpBlacklistGuard implements CanActivate {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly reflector: Reflector,
    @Inject(IP_LIST_PORT) private readonly ipList: IpListPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.featureFlags.isEnabled('ipBlacklistEnabled')) return true;
    if (isInfraEndpoint(context, this.reflector)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip;

    // 封鎖類控制採 fail-closed：取不到可信來源 IP 時直接拒絕，
    // 避免在 trust proxy 設定不當或 socket 異常時靜默放行（與白名單方向一致）。
    if (!ip) {
      throw new ForbiddenException('無法判定來源 IP，請求遭拒');
    }

    if (await this.ipList.isBlacklisted(ip)) {
      throw new ForbiddenException('IP 位址已被封鎖');
    }

    return true;
  }
}
