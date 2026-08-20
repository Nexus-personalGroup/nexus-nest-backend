import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import pino from 'pino';

const log = pino({
  name: 'seed-test-members',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const BCRYPT_ROUNDS = 10;

// 管理員帳號可透過 env 覆蓋（ADMIN_DEFAULT_EMAIL / ADMIN_DEFAULT_PASSWORD）
const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@test.com';
const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin1234!';

const TEST_MEMBERS = [
  {
    email: adminEmail,
    member: '超級管理者',
    password: adminPassword,
    roleCode: 'SUPERADMIN',
    isDefault: true,
  },
];

export default async function seed(prisma: PrismaClient): Promise<void> {
  log.info('插入測試帳號...');

  for (const m of TEST_MEMBERS) {
    const role = await prisma.role.findFirstOrThrow({
      where: { roleCode: m.roleCode },
    });

    const passwordHash = await bcrypt.hash(m.password, BCRYPT_ROUNDS);

    await prisma.memberRecord.upsert({
      where: { email: m.email },
      update: {
        member: m.member,
        password: passwordHash,
        roleId: role.id,
        isDefault: m.isDefault,
      },
      create: {
        email: m.email,
        member: m.member,
        password: passwordHash,
        roleId: role.id,
        isDefault: m.isDefault,
      },
    });

    log.info(`${m.member}（${m.email}）← role: ${m.roleCode}`);
  }

  log.info(`完成：${TEST_MEMBERS.length} 個測試帳號`);
}
