import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import pino from 'pino';

const log = pino({
  name: 'seed-test-users',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const BCRYPT_ROUNDS = 10;

/**
 * 前台的測試使用者。
 *
 * 註冊流程還沒做（`add-front-user-registration`），在那之前這是唯一的帳號來源。
 * 三個帳號足以驗證登入、側別隔離、以及聊天領域的遷移：
 * 兩個正常的（可以互相私聊、建群組）加一個停權的（驗 403 的路徑）。
 */
const TEST_USERS = [
  {
    email: 'user1@test.com',
    displayName: '小明',
    password: 'User1234!',
    status: true,
  },
  {
    email: 'user2@test.com',
    displayName: '小華',
    password: 'User1234!',
    status: true,
  },
  {
    email: 'suspended@test.com',
    displayName: '被停權的人',
    password: 'User1234!',
    status: false,
  },
];

export default async function seed(prisma: PrismaClient): Promise<void> {
  log.info('插入前台測試使用者...');

  for (const u of TEST_USERS) {
    const passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);

    await prisma.userRecord.upsert({
      where: { email: u.email },
      update: {
        displayName: u.displayName,
        password: passwordHash,
        status: u.status,
      },
      create: {
        email: u.email,
        displayName: u.displayName,
        password: passwordHash,
        status: u.status,
      },
    });

    log.info(`${u.displayName}（${u.email}）status=${u.status}`);
  }

  log.info(`完成：${TEST_USERS.length} 個前台測試帳號`);
}
