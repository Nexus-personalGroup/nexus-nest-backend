import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { EmailAlreadyExistsException } from '@app/domain/exception/EmailAlreadyExistsException';
import {
  LOAD_USER_PORT,
  ListUsersPage,
  ListUsersParams,
  LoadUserPort,
  UserDetailDto,
  UserRecordDto,
} from '@app/application/port/out/user/LoadUserPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '@app/application/port/out/user/SaveUserPort';

export { LOAD_USER_PORT, SAVE_USER_PORT };

/** 前台使用者的持久層。與 `members` 完全獨立——兩者是不同的帳號體系 */
@Injectable()
export class PrismaUserRepository implements LoadUserPort, SaveUserPort {
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

  async findEmailsByIds(ids: string[]): Promise<Map<string, string>> {
    // 空陣列直接回：`in: []` 是一個必然無結果的查詢，送出去只是浪費一次往返
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.userRecord.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, email: true },
    });
    return new Map(rows.map((row) => [row.id, row.email]));
  }

  async findActiveUserIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.userRecord.findMany({
      where: { id: { in: ids }, status: true, deletedAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async countUsers(): Promise<number> {
    return this.prisma.userRecord.count({ where: { deletedAt: null } });
  }

  async listUsers(params: ListUsersParams): Promise<ListUsersPage> {
    const where = {
      deletedAt: null,
      ...(params.email
        ? { email: { contains: params.email, mode: 'insensitive' as const } }
        : {}),
      ...(params.displayName
        ? {
            displayName: {
              contains: params.displayName,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(params.status === undefined ? {} : { status: params.status }),
      // verified 是「有沒有時間戳」而不是一個布林欄位，因此翻成 null 判斷
      ...(params.verified === undefined
        ? {}
        : { emailVerifiedAt: params.verified ? { not: null } : null }),
    };

    const [data, total] = await Promise.all([
      this.prisma.userRecord.findMany({
        where,
        select: this.summaryFields,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.userRecord.count({ where }),
    ]);
    return { data, total };
  }

  async loadDetailById(id: string): Promise<UserDetailDto | null> {
    return this.prisma.userRecord.findFirst({
      where: { id, deletedAt: null },
      select: this.summaryFields,
    });
  }

  async suspend(id: string): Promise<boolean> {
    // where 帶 status: true——條件式更新讓「是否真的改變了」由 DB 回答，
    // 而不是先讀再寫（那有兩個請求同時通過的窗口，結果是重複稽核）
    const { count } = await this.prisma.userRecord.updateMany({
      where: { id, status: true, deletedAt: null },
      data: { status: false, tokenVersion: { increment: 1 } },
    });
    return count > 0;
  }

  async reinstate(id: string): Promise<boolean> {
    const { count } = await this.prisma.userRecord.updateMany({
      where: { id, status: false, deletedAt: null },
      data: { status: true },
    });
    return count > 0;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const found = await this.prisma.userRecord.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  async create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<string> {
    // emailVerifiedAt 刻意不出現在這裡：沒有任何路徑可以在建立當下就標成已驗證
    try {
      const created = await this.prisma.userRecord.create({
        data: {
          email: input.email,
          password: input.passwordHash,
          displayName: input.displayName,
        },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      // 唯一索引衝突是**正常結果而非錯誤**：呼叫端是「先查再建」，
      // 兩個併發請求會都通過查詢而在這裡撞上。不接住的話 Prisma 的例外
      // 會一路冒到 GlobalExceptionFilter 兜成 500，而契約說好的是 409。
      //
      // **「先查」的角色因此不是防止衝突**（那是唯一索引的工作），
      // 而是給出更好的錯誤訊息、並在帳號未驗證時順便重發驗證信——
      // 少了這個理解，下一個人會以為先查多餘而刪掉它，那條重發路徑就消失了。
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsException();
      }
      throw err;
    }
  }

  async markEmailVerified(id: string): Promise<boolean> {
    // where 帶 emailVerifiedAt: null——已驗證的再標一次要回 false，
    // 呼叫端才分得出「剛剛驗證成功」與「本來就驗證過了」
    const { count } = await this.prisma.userRecord.updateMany({
      where: { id, emailVerifiedAt: null, deletedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    return count > 0;
  }

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    // 密碼與 tokenVersion 一起寫：會走到改密碼的情境本來就包含
    // 「帳號可能正被別人用著」，讓所有裝置登出是那個情境的一部分
    const { count } = await this.prisma.userRecord.updateMany({
      where: { id, deletedAt: null },
      data: { password: passwordHash, tokenVersion: { increment: 1 } },
    });
    return count > 0;
  }

  async bumpTokenVersion(id: string): Promise<boolean> {
    // where 不帶 status——強制登出與停權互相獨立，
    // 對已停權的帳號再次強制登出仍然應該生效
    const { count } = await this.prisma.userRecord.updateMany({
      where: { id, deletedAt: null },
      data: { tokenVersion: { increment: 1 } },
    });
    return count > 0;
  }

  /** 認證流程專用——**含 password hash**，不可用於任何顯示路徑 */
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

  /** 後台顯示用——**刻意不含 password 與 tokenVersion**，兩者都不該離開伺服器 */
  private readonly summaryFields = {
    id: true,
    email: true,
    displayName: true,
    avatarUrl: true,
    status: true,
    emailVerifiedAt: true,
    lastSeenAt: true,
    createdAt: true,
  } as const;
}
