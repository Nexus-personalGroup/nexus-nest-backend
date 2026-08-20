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
