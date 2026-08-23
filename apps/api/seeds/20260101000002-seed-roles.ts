import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const log = pino({
  name: 'seed-roles',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const ROLES = [
  {
    name: '超級管理者',
    roleCode: 'SUPERADMIN',
    isDefault: true,
    // null = 全部權限
    permissionCodes: null as string[] | null,
  },
];

/**
 * **每次都跑。** 預設角色（SUPERADMIN）宣告的是「**全部**權限」，
 * 那是一個會隨權限目錄成長的集合。只跑一次的話，新增權限碼之後
 * SUPERADMIN 會悄悄地不再擁有全部權限——而它的角色是 `isDefault`，
 * UI 上改不了（`DefaultRoleNotEditableException`），等於沒有任何補救路徑。
 *
 * 只做 upsert，**不移除任何既有的授權**，因此重跑不會動到人工調整過的角色。
 */
export const alwaysRun = true;

export default async function seed(prisma: PrismaClient): Promise<void> {
  log.info('插入角色與權限分配...');

  const allPermissions = await prisma.permission.findMany({
    where: { status: true },
  });

  for (const roleConfig of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleConfig.name },
      update: {
        isDefault: roleConfig.isDefault,
        roleCode: roleConfig.roleCode,
      },
      create: {
        name: roleConfig.name,
        roleCode: roleConfig.roleCode,
        isDefault: roleConfig.isDefault,
      },
    });

    const targetPermissions =
      roleConfig.permissionCodes === null
        ? allPermissions
        : allPermissions.filter((p) =>
            roleConfig.permissionCodes!.includes(p.permissionCode),
          );

    for (const permission of targetPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    log.info(
      `${roleConfig.name}（roleCode: ${roleConfig.roleCode}，${targetPermissions.length} 個 permissions）`,
    );
  }
}
