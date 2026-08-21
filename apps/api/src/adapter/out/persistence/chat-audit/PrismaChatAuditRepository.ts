import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import { getEnv } from '@app/infrastructure/validate-env';
import {
  CHAT_AUDIT_PORT,
  ChatAuditEvent,
  ChatAuditPort,
  ListAuditPage,
  ListAuditParams,
} from '@app/application/port/out/ChatAuditPort';

export { CHAT_AUDIT_PORT };

@Injectable()
export class PrismaChatAuditRepository implements ChatAuditPort {
  private readonly logger = new Logger(PrismaChatAuditRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: ChatAuditEvent): Promise<void> {
    // getEnv() 自身會快取解析結果，因此這個開關實際上是**啟動時**決定的——
    // 執行期改 process.env 不會生效。這對設定是正確的行為，但代表
    // 「關閉稽核」只能用單元測試（mock getEnv）驗證，e2e 改不動它
    if (!getEnv().CHAT_AUDIT_ENABLED) return;

    await this.prisma.chatAuditLogRecord.create({
      data: {
        memberId: event.memberId,
        action: event.action,
        roomId: event.roomId ?? null,
        targetMemberId: event.targetMemberId ?? null,
        targetMessageId: event.targetMessageId ?? null,
      },
    });
    this.logger.debug(`稽核：${event.action} by ${event.memberId}`);
  }

  async listByMember(params: ListAuditParams): Promise<ListAuditPage> {
    const where = { memberId: params.memberId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.chatAuditLogRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: {
          action: true,
          roomId: true,
          targetMemberId: true,
          targetMessageId: true,
          createdAt: true,
        },
      }),
      this.prisma.chatAuditLogRecord.count({ where }),
    ]);
    return { data: rows, total };
  }
}
