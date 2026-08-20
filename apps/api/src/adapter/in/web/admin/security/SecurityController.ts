import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SecurityFacade } from '@app/application/facade/admin/SecurityFacade';
import {
  IpBlacklistItem,
  IpListItem,
} from '@app/application/port/out/security/IpListPort';
import { ListIpListResult } from '@app/application/port/in/admin/security/SecurityUseCases';
import { RolesGuard } from '../../guard/RolesGuard';
import { Roles } from '../../decorator/roles.decorator';
import { RoleCode } from '@app/domain/value-object/Role';
import { CurrentMember } from '../../decorator/current-member.decorator';
import { MemberContext } from '@app/application/port/member-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { listIpListQuerySchema, ListIpListQuery } from './ListIpListQuery';
import {
  AddIpWhitelistRequest,
  addIpWhitelistSchema,
} from './AddIpWhitelistRequest';
import {
  AddIpBlacklistRequest,
  addIpBlacklistSchema,
} from './AddIpBlacklistRequest';
import {
  UpdateIpWhitelistRequest,
  updateIpWhitelistSchema,
} from './UpdateIpWhitelistRequest';
import {
  UpdateIpBlacklistRequest,
  updateIpBlacklistSchema,
} from './UpdateIpBlacklistRequest';
import {
  UnlockAccountRequest,
  unlockAccountSchema,
} from './UnlockAccountRequest';

/**
 * 安全管理 Controller（SUPERADMIN only）：
 * - IP 黑白名單 CRUD（分頁 + IP 模糊搜尋 + by-id GET/PATCH/DELETE）
 * - 帳號解鎖（成功 204、找不到 email 404、未鎖 409）
 *
 * 注意：security 模組刻意用 RolesGuard + @Roles(SUPERADMIN) 粗粒度 role gate，
 * 不走其他模組的 PermissionsGuard 細粒度權限
 *
 * ⚠️ 授權完全依賴 RolesGuard，而 RolesGuard 受 adminRoleEnabled flag 控制：該 flag 關閉時
 * （僅可能於 dev，生產由 validate-env 強制開啟並在關閉時 process.exit）本模組對所有已登入者開放。
 */
@Controller('admin/security')
@UseGuards(RolesGuard)
@Roles(RoleCode.SUPERADMIN)
export class SecurityController {
  constructor(private readonly securityFacade: SecurityFacade) {}

  // ── IP 白名單 ────────────────────────────────

  @Get('ip-whitelist')
  listWhitelist(
    @Query(new ZodValidationPipe(listIpListQuerySchema))
    query: ListIpListQuery,
  ): Promise<ListIpListResult<IpListItem>> {
    return this.securityFacade.listWhitelist(query);
  }

  @Post('ip-whitelist')
  @HttpCode(HttpStatus.CREATED)
  addToWhitelist(
    @Body(new ZodValidationPipe(addIpWhitelistSchema))
    dto: AddIpWhitelistRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<{ id: string }> {
    return this.securityFacade.addToWhitelist({
      ip: dto.ip,
      description: dto.description,
      createdBy: member.sub,
    });
  }

  @Get('ip-whitelist/:id')
  getWhitelist(@Param('id', ParseUUIDPipe) id: string): Promise<IpListItem> {
    return this.securityFacade.getWhitelist(id);
  }

  @Patch('ip-whitelist/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateWhitelist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateIpWhitelistSchema))
    dto: UpdateIpWhitelistRequest,
  ): Promise<void> {
    await this.securityFacade.updateWhitelist({ id, ...dto });
  }

  @Delete('ip-whitelist/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWhitelist(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.securityFacade.removeFromWhitelist(id);
  }

  // ── IP 黑名單 ────────────────────────────────

  @Get('ip-blacklist')
  listBlacklist(
    @Query(new ZodValidationPipe(listIpListQuerySchema))
    query: ListIpListQuery,
  ): Promise<ListIpListResult<IpBlacklistItem>> {
    return this.securityFacade.listBlacklist(query);
  }

  @Post('ip-blacklist')
  @HttpCode(HttpStatus.CREATED)
  addToBlacklist(
    @Body(new ZodValidationPipe(addIpBlacklistSchema))
    dto: AddIpBlacklistRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<{ id: string }> {
    return this.securityFacade.addToBlacklist({
      ip: dto.ip,
      reason: dto.reason,
      createdBy: member.sub,
    });
  }

  @Get('ip-blacklist/:id')
  getBlacklist(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IpBlacklistItem> {
    return this.securityFacade.getBlacklist(id);
  }

  @Patch('ip-blacklist/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateBlacklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateIpBlacklistSchema))
    dto: UpdateIpBlacklistRequest,
  ): Promise<void> {
    await this.securityFacade.updateBlacklist({ id, ...dto });
  }

  @Delete('ip-blacklist/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromBlacklist(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.securityFacade.removeFromBlacklist(id);
  }

  // ── 帳號解鎖 ─────────────────────────────────

  @Post('unlock-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlockAccount(
    @Body(new ZodValidationPipe(unlockAccountSchema))
    dto: UnlockAccountRequest,
  ): Promise<void> {
    await this.securityFacade.unlockAccount(dto.email);
  }
}
