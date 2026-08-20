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
import { RoleFacade } from '@app/application/facade/admin/RoleFacade';
import { PermissionsGuard } from '../../guard/PermissionsGuard';
import { Permissions } from '../../decorator/permissions.decorator';
import { PermissionCode } from '@app/domain/value-object/Role';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { listRolesQuerySchema, ListRolesQuery } from './ListRolesQuery';
import { createRoleSchema, CreateRoleRequest } from './CreateRoleRequest';
import { updateRoleSchema, UpdateRoleRequest } from './UpdateRoleRequest';

@Controller('admin/roles')
@UseGuards(PermissionsGuard)
export class RoleController {
  constructor(private readonly roleFacade: RoleFacade) {}

  @Get()
  @Permissions(PermissionCode.BACKEND_ROLE_VIEW)
  listRoles(
    @Query(new ZodValidationPipe(listRolesQuerySchema)) query: ListRolesQuery,
  ) {
    return this.roleFacade.listRoles(query);
  }

  @Get('permissions')
  @Permissions(PermissionCode.BACKEND_ROLE_VIEW)
  listPermissions() {
    return this.roleFacade.listPermissions();
  }

  @Get(':id')
  @Permissions(PermissionCode.BACKEND_ROLE_VIEW)
  getRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleFacade.getRole(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PermissionCode.BACKEND_ROLE_EDIT)
  createRole(
    @Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleRequest,
  ) {
    return this.roleFacade.createRole({
      name: dto.name,
      permissionCodes: dto.permissionCodes,
    });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PermissionCode.BACKEND_ROLE_EDIT)
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleRequest,
  ) {
    await this.roleFacade.updateRole({ id, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PermissionCode.BACKEND_ROLE_EDIT)
  async deleteRole(@Param('id', ParseUUIDPipe) id: string) {
    await this.roleFacade.deleteRole(id);
  }
}
