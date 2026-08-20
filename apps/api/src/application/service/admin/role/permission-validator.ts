import { InvalidPermissionCodeException } from '@app/domain/exception/InvalidPermissionCodeException';
import { InvalidPermissionCombinationException } from '@app/domain/exception/InvalidPermissionCombinationException';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';

/** 共用權限驗證邏輯：檢查 code 存在於 DB，並驗證 EDIT 必須搭配 VIEW */
export const validatePermissions = async (
  codes: string[],
  permissionRepo: PermissionRepositoryPort,
): Promise<void> => {
  if (codes.length === 0) return;

  const found = await permissionRepo.findByCodes(codes);
  const foundCodes = new Set(found.map((p) => p.permissionCode));
  const missing = codes.filter((c) => !foundCodes.has(c));
  if (missing.length > 0) throw new InvalidPermissionCodeException(missing);

  const codeSet = new Set(codes);
  for (const code of codes) {
    const parts = code.split(':');
    if (parts.length === 3 && parts[2] === 'EDIT') {
      const viewCode = `${parts[0]}:${parts[1]}:VIEW`;
      if (!codeSet.has(viewCode)) {
        throw new InvalidPermissionCombinationException(
          `${parts[0]}:${parts[1]}`,
        );
      }
    }
  }
};
