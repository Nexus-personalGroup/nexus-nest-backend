import { Prisma } from '@prisma/client';
import { PrismaUserRepository } from './PrismaUserRepository';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import type { PrismaService } from '@app/infrastructure/prisma/prisma.service';

const INPUT = {
  email: 'user@example.com',
  passwordHash: '$2b$10$hash',
  displayName: '小明',
};

const makeRepo = (create: jest.Mock, updateMany = jest.fn()) =>
  new PrismaUserRepository({
    userRecord: { create, updateMany },
  } as unknown as PrismaService);

/** Prisma 的唯一索引衝突 */
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

/**
 * 建立使用者時的唯一索引衝突。
 *
 * `FrontRegisterService` 是「先查再建」，兩個併發請求會都通過查詢而在這裡撞上。
 * **唯一索引衝突是正常結果而非錯誤**——不接住的話 Prisma 的例外會冒到
 * `GlobalExceptionFilter` 兜成 500，而契約說好的是 409。
 *
 * 這個 codebase 的其他四張表（members / chat_rooms / chat_messages / chat_reports）
 * 都已經這樣做了，只有 `users` 這張新表漏掉——**新表沒有繼承既有的模式**。
 */
describe('PrismaUserRepository.create', () => {
  it('建立成功回傳 id', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'user-1' });

    expect(await makeRepo(create).create(INPUT)).toBe('user-1');
  });

  it('⭐ 撞上唯一索引 → 轉成 EmailAlreadyExistsException', async () => {
    const create = jest.fn().mockRejectedValue(uniqueViolation());

    await expect(makeRepo(create).create(INPUT)).rejects.toBeInstanceOf(
      EmailAlreadyExistsException,
    );
  });

  // 只轉 P2002；其他資料庫錯誤照原樣往上拋，否則會被誤報成「信箱已存在」
  it('其他 Prisma 錯誤原樣拋出', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('timeout', {
      code: 'P1008',
      clientVersion: 'test',
    });
    const create = jest.fn().mockRejectedValue(other);

    await expect(makeRepo(create).create(INPUT)).rejects.toBe(other);
  });

  it('非 Prisma 的例外原樣拋出', async () => {
    const boom = new Error('boom');
    const create = jest.fn().mockRejectedValue(boom);

    await expect(makeRepo(create).create(INPUT)).rejects.toBe(boom);
  });
});

/**
 * 標記信箱已驗證。
 *
 * **條件式更新是這支的重點**：`where` 帶 `emailVerifiedAt: null`，
 * 因此已驗證的帳號再標一次不會覆寫原本的時間，重複呼叫安全。
 * 重設密碼那條路徑（`FrontResetPasswordService`）依賴這個保證——
 * 它對每一次成功的重設都呼叫，包含本來就已驗證的帳號。
 */
describe('PrismaUserRepository.markEmailVerified', () => {
  it('⭐ 只更新尚未驗證的那一列', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    await makeRepo(jest.fn(), updateMany).markEmailVerified('user-1');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ emailVerifiedAt: null }),
      }),
    );
  });

  // 呼叫端要分得出「剛剛驗證成功」與「本來就驗證過了」
  it('已驗證（沒有列被更新）→ 回 false', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });

    expect(
      await makeRepo(jest.fn(), updateMany).markEmailVerified('user-1'),
    ).toBe(false);
  });

  it('首次驗證 → 回 true', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    expect(
      await makeRepo(jest.fn(), updateMany).markEmailVerified('user-1'),
    ).toBe(true);
  });

  // 軟刪除的帳號不該被標記
  it('條件帶 deletedAt: null', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    await makeRepo(jest.fn(), updateMany).markEmailVerified('user-1');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});
