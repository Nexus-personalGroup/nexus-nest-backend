import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_PERMISSIONS_USE_CASE,
  ListPermissionsUseCase,
  PermissionListItem,
} from '../../../port/in/admin/role/ListPermissionsUseCase';
import {
  PERMISSION_REPOSITORY_PORT,
  PermissionRepositoryPort,
} from '../../../port/out/role/PermissionRepositoryPort';

export { LIST_PERMISSIONS_USE_CASE };

@Injectable()
export class ListPermissionsService implements ListPermissionsUseCase {
  constructor(
    @Inject(PERMISSION_REPOSITORY_PORT)
    private readonly permissionRepo: PermissionRepositoryPort,
  ) {}

  execute(): Promise<PermissionListItem[]> {
    return this.permissionRepo.findAll();
  }
}
