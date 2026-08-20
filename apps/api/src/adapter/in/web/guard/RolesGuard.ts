import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RoleCode } from '@app/domain/value-object/Role';
import { FeatureFlagService } from '@app/application/service/shared/FeatureFlagService';
import { ROLES_KEY } from '../decorator/roles.decorator';

/**
 * 角色守衛：必須搭配 JwtAuthGuard 一起使用（JwtAuthGuard 先跑）。
 *
 * 當 APPLICATION_ADMIN_ROLE_ENABLED 關閉時，一律放行（跳過角色檢查）。
 *
 * ⚠️ 爆炸半徑：此 flag 關閉時，所有 @Roles() 端點（如 SecurityController 的 IP 黑白名單、
 * 帳號解鎖）對「任何已登入者」開放。生產環境由 validate-env 強制 adminRoleEnabled=true
 * 並在關閉時 process.exit(1) 守住；但本機 / dev 關閉時 security 模組形同不設防，請勿在
 * 共用環境關閉此 flag。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.featureFlags.isEnabled('adminRoleEnabled')) return true;

    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userRoleCode = request.member?.roleCode;

    // 用 roleCode（如 SUPERADMIN）比對，不要用 roleName（顯示名「管理者」）；
    // .some 而非 .includes 避免把 string 強轉成 RoleCode
    if (!userRoleCode || !requiredRoles.some((r) => r === userRoleCode)) {
      throw new ForbiddenException('權限不足');
    }

    return true;
  }
}
