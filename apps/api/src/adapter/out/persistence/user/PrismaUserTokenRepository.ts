import { randomBytes, createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  USER_TOKEN_PORT,
  UserTokenPort,
  UserTokenPurpose,
} from '@app/application/port/out/user/UserTokenPort';

export { USER_TOKEN_PORT };

/** token 的位元組數。32 bytes = 256 bits，遠高於任何暴力枚舉的可行範圍 */
const TOKEN_BYTES = 32;

/**
 * 前台使用者的一次性 token。
 *
 * **資料庫只存 sha256 雜湊**，明文只在寄信那一刻存在於記憶體裡。
 * 不用 bcrypt：token 是高熵隨機值，不像密碼那樣需要用慢雜湊去抵抗字典攻擊，
 * 而每次驗證都跑一輪 bcrypt 只是把成本加在自己身上。
 */
@Injectable()
export class PrismaUserTokenRepository implements UserTokenPort {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    purpose: UserTokenPurpose,
    ttlSeconds: number,
  ): Promise<string> {
    const plain = randomBytes(TOKEN_BYTES).toString('hex');

    // 先作廢舊的再建新的：順序顛倒的話，中間那一瞬間新舊都有效，
    // 而「作廢」這個動作會把剛建好的那個也一起蓋掉
    await this.invalidateOthers(userId, purpose);
    await this.prisma.userTokenRecord.create({
      data: {
        userId,
        token: hash(plain),
        purpose,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });

    return plain;
  }

  async consume(
    token: string,
    purpose: UserTokenPurpose,
  ): Promise<string | null> {
    const record = await this.findUsable(token, purpose);
    if (!record) return null;

    // 條件式更新：`usedAt: null` 讓「兩個請求同時帶同一個 token」只有一個成功。
    // 先讀再寫的話兩邊都會看到 usedAt 是 null，然後都通過
    const { count } = await this.prisma.userTokenRecord.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) return null;

    await this.invalidateOthers(record.userId, purpose);
    return record.userId;
  }

  async peekOwner(
    token: string,
    purpose: UserTokenPurpose,
  ): Promise<string | null> {
    // 刻意不看 usedAt 與 expiresAt：這支存在的理由就是「token 已經被用掉了，
    // 但我還是要知道它屬於誰」（驗證成功要冪等）
    const record = await this.prisma.userTokenRecord.findUnique({
      where: { token: hash(token) },
      select: { userId: true, purpose: true },
    });
    return record?.purpose === purpose ? record.userId : null;
  }

  /** 找一個可用的 token：存在、用途相符、未使用、未過期 */
  private async findUsable(
    token: string,
    purpose: UserTokenPurpose,
  ): Promise<{ id: string; userId: string } | null> {
    return this.prisma.userTokenRecord.findFirst({
      where: {
        token: hash(token),
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });
  }

  /**
   * 作廢某使用者同用途的所有未使用 token。
   *
   * 標 `usedAt` 而非刪除：與這張表的其他操作一致——保留紀錄才查得到
   * 「這個 token 何時失效的」。
   */
  private async invalidateOthers(
    userId: string,
    purpose: UserTokenPurpose,
  ): Promise<void> {
    await this.prisma.userTokenRecord.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}

/** token 的單向雜湊。明文只在寄信那一刻存在，資料庫裡永遠只有這個 */
const hash = (plain: string): string =>
  createHash('sha256').update(plain).digest('hex');
