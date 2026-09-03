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
 * 全域 Guard：當 IP 白名單功能啟用時，僅允許白名單中的 IP 存取。
 * 功能關閉時直接放行。
 *
 * 基礎設施探針（健康檢查 / 指標）不受限制：它們是給機器用的，不是使用者流量。
 * 把 liveness 探針算進「使用者」換來的不是安全而是服務停擺——
 * 容器 healthcheck 403 會讓整組起不來，k8s 則是 CrashLoopBackOff。
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly reflector: Reflector,
    @Inject(IP_LIST_PORT) private readonly ipList: IpListPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.featureFlags.isEnabled('ipWhitelistEnabled')) return true;
    if (isInfraEndpoint(context, this.reflector)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip;

    if (!ip || !(await this.ipList.isWhitelisted(ip))) {
      throw new ForbiddenException('IP 位址不在白名單中');
    }

    return true;
  }
}
