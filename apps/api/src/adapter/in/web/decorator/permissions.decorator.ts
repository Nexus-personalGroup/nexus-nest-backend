import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '@app/domain/value-object/Role';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...codes: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
