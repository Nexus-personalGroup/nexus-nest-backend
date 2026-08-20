import { Inject, Injectable } from '@nestjs/common';
import {
  UPDATE_ROLE_USE_CASE,
  UpdateRoleCommand,
  UpdateRoleUseCase,
} from '../../../port/in/admin/role/UpdateRoleUseCase';
import {
  ROLE_REPOSITORY_PORT,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import {
  PERMISSION_REPOSITORY_PORT,
  PermissionRepositoryPort,
} from '../../../port/out/role/PermissionRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { DuplicateRoleNameException } from '@app/domain/exception/DuplicateRoleNameException';
import { DefaultRoleNotEditableException } from '@app/domain/exception/DefaultRoleNotEditableException';
import { validatePermissions } from './permission-validator';

export { UPDATE_ROLE_USE_CASE };

@Injectable()
export class UpdateRoleService implements UpdateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY_PORT)
    private readonly roleRepo: RoleRepositoryPort,
    @Inject(PERMISSION_REPOSITORY_PORT)
    private readonly permissionRepo: PermissionRepositoryPort,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<void> {
    const role = await this.roleRepo.findById(command.id);
    if (!role) throw new RoleNotFoundException();
    if (role.isDefault) throw new DefaultRoleNotEditableException();

    if (command.name !== undefined && command.name !== role.name) {
      const conflict = await this.roleRepo.findByName(command.name);
      if (conflict) throw new DuplicateRoleNameException(command.name);
    }

    if (command.permissionCodes !== undefined) {
      await validatePermissions(command.permissionCodes, this.permissionRepo);
    }

    await this.roleRepo.updateWithPermissions(
      command.id,
      command.name,
      command.permissionCodes,
      command.status,
    );
  }
}
