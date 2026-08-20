import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_ROLES_USE_CASE,
  ListRolesQuery,
  ListRolesResult,
  ListRolesUseCase,
} from '../../port/in/admin/role/ListRolesUseCase';
import {
  GET_ROLE_USE_CASE,
  GetRoleUseCase,
  RoleDetail,
} from '../../port/in/admin/role/GetRoleUseCase';
import {
  CREATE_ROLE_USE_CASE,
  CreateRoleCommand,
  CreateRoleResult,
  CreateRoleUseCase,
} from '../../port/in/admin/role/CreateRoleUseCase';
import {
  UPDATE_ROLE_USE_CASE,
  UpdateRoleCommand,
  UpdateRoleUseCase,
} from '../../port/in/admin/role/UpdateRoleUseCase';
import {
  DELETE_ROLE_USE_CASE,
  DeleteRoleUseCase,
} from '../../port/in/admin/role/DeleteRoleUseCase';
import {
  LIST_PERMISSIONS_USE_CASE,
  ListPermissionsUseCase,
  PermissionListItem,
} from '../../port/in/admin/role/ListPermissionsUseCase';

@Injectable()
export class RoleFacade {
  constructor(
    @Inject(LIST_ROLES_USE_CASE)
    private readonly listRolesUseCase: ListRolesUseCase,
    @Inject(GET_ROLE_USE_CASE)
    private readonly getRoleUseCase: GetRoleUseCase,
    @Inject(CREATE_ROLE_USE_CASE)
    private readonly createRoleUseCase: CreateRoleUseCase,
    @Inject(UPDATE_ROLE_USE_CASE)
    private readonly updateRoleUseCase: UpdateRoleUseCase,
    @Inject(DELETE_ROLE_USE_CASE)
    private readonly deleteRoleUseCase: DeleteRoleUseCase,
    @Inject(LIST_PERMISSIONS_USE_CASE)
    private readonly listPermissionsUseCase: ListPermissionsUseCase,
  ) {}

  listRoles(query: ListRolesQuery): Promise<ListRolesResult> {
    return this.listRolesUseCase.execute(query);
  }

  getRole(id: string): Promise<RoleDetail> {
    return this.getRoleUseCase.execute(id);
  }

  createRole(command: CreateRoleCommand): Promise<CreateRoleResult> {
    return this.createRoleUseCase.execute(command);
  }

  updateRole(command: UpdateRoleCommand): Promise<void> {
    return this.updateRoleUseCase.execute(command);
  }

  deleteRole(id: string): Promise<void> {
    return this.deleteRoleUseCase.execute(id);
  }

  listPermissions(): Promise<PermissionListItem[]> {
    return this.listPermissionsUseCase.execute();
  }
}
