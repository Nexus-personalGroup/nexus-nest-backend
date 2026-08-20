import { Module, forwardRef } from '@nestjs/common';
import { RoleController } from '../../adapter/in/web/admin/role/RoleController';
import { RoleFacade } from '../../application/facade/admin/RoleFacade';
import { PrismaRoleRepository } from '../../adapter/out/persistence/role/PrismaRoleRepository';
import { PrismaPermissionRepository } from '../../adapter/out/persistence/role/PrismaPermissionRepository';
import { ROLE_REPOSITORY_PORT } from '../../application/port/out/role/RoleRepositoryPort';
import { PERMISSION_REPOSITORY_PORT } from '../../application/port/out/role/PermissionRepositoryPort';
import { LOAD_ROLE_PORT } from '../../application/port/out/role/LoadRolePort';
import { LIST_ROLES_USE_CASE } from '../../application/port/in/admin/role/ListRolesUseCase';
import { GET_ROLE_USE_CASE } from '../../application/port/in/admin/role/GetRoleUseCase';
import { CREATE_ROLE_USE_CASE } from '../../application/port/in/admin/role/CreateRoleUseCase';
import { UPDATE_ROLE_USE_CASE } from '../../application/port/in/admin/role/UpdateRoleUseCase';
import { DELETE_ROLE_USE_CASE } from '../../application/port/in/admin/role/DeleteRoleUseCase';
import { LIST_PERMISSIONS_USE_CASE } from '../../application/port/in/admin/role/ListPermissionsUseCase';
import { ListRolesService } from '../../application/service/admin/role/ListRolesService';
import { GetRoleService } from '../../application/service/admin/role/GetRoleService';
import { CreateRoleService } from '../../application/service/admin/role/CreateRoleService';
import { UpdateRoleService } from '../../application/service/admin/role/UpdateRoleService';
import { DeleteRoleService } from '../../application/service/admin/role/DeleteRoleService';
import { ListPermissionsService } from '../../application/service/admin/role/ListPermissionsService';
import { JwtModule } from '../jwt.module';
import { MemberModule } from './member.module';

@Module({
  imports: [JwtModule, forwardRef(() => MemberModule)],
  controllers: [RoleController],
  providers: [
    PrismaRoleRepository,
    PrismaPermissionRepository,
    { provide: ROLE_REPOSITORY_PORT, useExisting: PrismaRoleRepository },
    {
      provide: PERMISSION_REPOSITORY_PORT,
      useExisting: PrismaPermissionRepository,
    },
    { provide: LOAD_ROLE_PORT, useExisting: PrismaRoleRepository },
    { provide: LIST_ROLES_USE_CASE, useClass: ListRolesService },
    { provide: GET_ROLE_USE_CASE, useClass: GetRoleService },
    { provide: CREATE_ROLE_USE_CASE, useClass: CreateRoleService },
    { provide: UPDATE_ROLE_USE_CASE, useClass: UpdateRoleService },
    { provide: DELETE_ROLE_USE_CASE, useClass: DeleteRoleService },
    { provide: LIST_PERMISSIONS_USE_CASE, useClass: ListPermissionsService },
    RoleFacade,
  ],
  exports: [LOAD_ROLE_PORT, PrismaRoleRepository],
})
export class RoleModule {}
