import { Inject, Injectable } from '@nestjs/common';
import {
  DELETE_ROLE_USE_CASE,
  DeleteRoleUseCase,
} from '../../../port/in/admin/role/DeleteRoleUseCase';
import {
  ROLE_REPOSITORY_PORT,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { DefaultRoleNotDeletableException } from '@app/domain/exception/DefaultRoleNotDeletableException';
import { RoleHasMembersException } from '@app/domain/exception/RoleHasMembersException';

export { DELETE_ROLE_USE_CASE };

@Injectable()
export class DeleteRoleService implements DeleteRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY_PORT)
    private readonly roleRepo: RoleRepositoryPort,
  ) {}

  async execute(id: string): Promise<void> {
    const role = await this.roleRepo.findById(id);
    if (!role) throw new RoleNotFoundException();
    if (role.isDefault) throw new DefaultRoleNotDeletableException();

    const memberCount = await this.roleRepo.countMembers(id);
    if (memberCount > 0) throw new RoleHasMembersException(memberCount);

    await this.roleRepo.softDelete(id);
  }
}
