import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import {
  PERMISSION_CATALOG,
  parsePermissionCode,
} from '../src/shared/constants/permissions';

const log = pino({
  name: 'seed-permissions',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

export default async function seed(prisma: PrismaClient): Promise<void> {
  log.info('插入權限資料...');

  // code 來自 PermissionCode（單一真相）；platform/module/action 由 code 拆解，不重複硬寫
  for (const { code, name } of PERMISSION_CATALOG) {
    const { platform, module, subModule, action } = parsePermissionCode(code);
    await prisma.permission.upsert({
      where: { permissionCode: code },
      update: { name, platform, module, subModule, action },
      create: {
        permissionCode: code,
        name,
        platform,
        module,
        subModule,
        action,
      },
    });
  }

  log.info(`完成：${PERMISSION_CATALOG.length} 個 permissions`);
}
