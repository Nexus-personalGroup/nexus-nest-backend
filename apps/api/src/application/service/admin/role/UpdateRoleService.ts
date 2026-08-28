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
import {
  MEMBER_CONTEXT_CACHE_PORT,
  MemberContextCachePort,
} from '../../../port/out/member/MemberContextCachePort';
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
    @Inject(MEMBER_CONTEXT_CACHE_PORT)
    private readonly memberContextCache: MemberContextCachePort,
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

    // 必須在寫入之後才清：先清再寫的話，中間那一瞬間進來的請求會把舊值重新快取回去。
    // 不判斷「這次改的是不是授權」——MemberContext 帶著 roleName / permissions /
    // 帳號可用性，三者都會過時；要判斷就得比對前後的權限集合，而那個比對寫錯的
    // 方向是「該清沒清」，一個沒有徵兆的失效。
    // 失敗不吞：這裡的語意是「權限改了但沒有生效」，吞掉會讓呼叫端看到「更新成功」
    // 而系統處於一個他不知道的狀態。
    const memberIds = await this.roleRepo.findMemberIdsByRole(command.id);
    await this.memberContextCache.clearMany(memberIds);
  }
}
