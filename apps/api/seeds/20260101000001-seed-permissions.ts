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

/**
 * **每次都跑。** 本檔同步的是 `PERMISSION_CATALOG` 這個編譯期常數，
 * 不是一次性的初始資料——只跑一次的話，日後新增的權限碼永遠進不了既有的資料庫。
 * 內容全部是 upsert，重跑沒有副作用。
 */
export const alwaysRun = true;

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
