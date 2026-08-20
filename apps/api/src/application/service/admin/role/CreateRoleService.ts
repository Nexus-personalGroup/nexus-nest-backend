import { Inject, Injectable } from '@nestjs/common';
import {
  CREATE_ROLE_USE_CASE,
  CreateRoleCommand,
  CreateRoleResult,
  CreateRoleUseCase,
} from '../../../port/in/admin/role/CreateRoleUseCase';
import {
  ROLE_REPOSITORY_PORT,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import {
  PERMISSION_REPOSITORY_PORT,
  PermissionRepositoryPort,
} from '../../../port/out/role/PermissionRepositoryPort';
import { DuplicateRoleNameException } from '@app/domain/exception/DuplicateRoleNameException';
import { validatePermissions } from './permission-validator';

export { CREATE_ROLE_USE_CASE };

@Injectable()
export class CreateRoleService implements CreateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY_PORT)
    private readonly roleRepo: RoleRepositoryPort,
    @Inject(PERMISSION_REPOSITORY_PORT)
    private readonly permissionRepo: PermissionRepositoryPort,
  ) {}

  async execute(command: CreateRoleCommand): Promise<CreateRoleResult> {
    const existing = await this.roleRepo.findByName(command.name);
    if (existing) throw new DuplicateRoleNameException(command.name);

    await validatePermissions(command.permissionCodes, this.permissionRepo);

    const role = await this.roleRepo.createWithPermissions(
      command.name,
      command.permissionCodes,
    );

    return { id: role.id };
  }
}
