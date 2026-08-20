import { Inject, Injectable } from '@nestjs/common';
import {
  GET_ROLE_USE_CASE,
  GetRoleUseCase,
  RoleDetail,
} from '../../../port/in/admin/role/GetRoleUseCase';
import {
  ROLE_REPOSITORY_PORT,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import {
  PERMISSION_REPOSITORY_PORT,
  PermissionRepositoryPort,
} from '../../../port/out/role/PermissionRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';

export { GET_ROLE_USE_CASE };

@Injectable()
export class GetRoleService implements GetRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY_PORT)
    private readonly roleRepo: RoleRepositoryPort,
    @Inject(PERMISSION_REPOSITORY_PORT)
    private readonly permissionRepo: PermissionRepositoryPort,
  ) {}

  async execute(id: string): Promise<RoleDetail> {
    const role = await this.roleRepo.findById(id);
    if (!role) throw new RoleNotFoundException();
    const permissionCodes =
      await this.permissionRepo.getPermissionsByRoleId(id);
    return {
      id: role.id,
      name: role.name,
      status: role.status,
      isDefault: role.isDefault,
      permissionCodes,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
