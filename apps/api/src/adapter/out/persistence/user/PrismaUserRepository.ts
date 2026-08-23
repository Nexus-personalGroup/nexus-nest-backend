import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  LOAD_USER_PORT,
  LoadUserPort,
  UserRecordDto,
} from '@app/application/port/out/user/LoadUserPort';

export { LOAD_USER_PORT };

/** 前台使用者的持久層。與 `members` 完全獨立——兩者是不同的帳號體系 */
@Injectable()
export class PrismaUserRepository implements LoadUserPort {
  private readonly logger = new Logger(PrismaUserRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadByEmail(email: string): Promise<UserRecordDto | null> {
    // 軟刪 model 的 read path 一律帶 deletedAt: null
    return this.prisma.userRecord.findFirst({
      where: { email, deletedAt: null },
      select: this.selectFields,
    });
  }

  async loadById(id: string): Promise<UserRecordDto | null> {
    return this.prisma.userRecord.findFirst({
      where: { id, deletedAt: null },
      select: this.selectFields,
    });
  }

  async touchLastSeen(id: string): Promise<void> {
    // updateMany 而非 update：後者在找不到時拋 P2025，而「帳號剛好被刪掉」
    // 對一個統計欄位而言不是需要中斷流程的事
    await this.prisma.userRecord
      .updateMany({
        where: { id, deletedAt: null },
        data: { lastSeenAt: new Date() },
      })
      .catch((error: unknown) => {
        // 寫不進一個統計用的時間戳，不該讓登入失敗
        this.logger.warn(
          `lastSeenAt 更新失敗 userId=${id}: ${
            error instanceof Error ? error.message : '未知錯誤'
          }`,
        );
      });
  }

  private readonly selectFields = {
    id: true,
    email: true,
    password: true,
    displayName: true,
    avatarUrl: true,
    emailVerifiedAt: true,
    status: true,
    tokenVersion: true,
    lastSeenAt: true,
    createdAt: true,
  } as const;
}
