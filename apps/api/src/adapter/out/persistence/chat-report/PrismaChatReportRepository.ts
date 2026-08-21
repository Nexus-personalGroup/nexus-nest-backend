import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
  ChatReportSummary,
  CreateReportInput,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';

export { CHAT_REPORT_REPOSITORY_PORT };

/** Prisma 查出的檢舉列（僅回應會用到的欄位；快照不外流） */
type ReportRow = {
  id: string;
  status: string;
  createdAt: Date;
};

@Injectable()
export class PrismaChatReportRepository implements ChatReportRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(input: CreateReportInput): Promise<ChatReportSummary> {
    try {
      const created = await this.prisma.chatReportRecord.create({
        data: {
          reporterId: input.reporterId,
          targetMessageId: input.targetMessageId,
          targetMemberId: input.targetMemberId,
          roomId: input.roomId,
          reason: input.reason,
          description: input.description ?? null,
          contentSnapshot: input.contentSnapshot,
        },
        select: this.summarySelect,
      });
      return this.toSummary(created);
    } catch (error) {
      // P2002 = 同一人已檢舉過同一則。這是正常結果而非錯誤：
      // 使用者的意圖已經達成了，回傳既有那筆讓重複送出與首次送出對呼叫端一致
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.chatReportRecord.findUniqueOrThrow({
          where: {
            reporterId_targetMessageId: {
              reporterId: input.reporterId,
              targetMessageId: input.targetMessageId,
            },
          },
          select: this.summarySelect,
        });
        return this.toSummary(existing);
      }
      throw error;
    }
  }

  // 刻意不選 contentSnapshot：它只給後台的 RBAC 路徑，
  // 前台的任何回應都不該有機會帶上它
  private readonly summarySelect = {
    id: true,
    status: true,
    createdAt: true,
  } as const;

  private toSummary(row: ReportRow): ChatReportSummary {
    return {
      reportId: row.id,
      status: row.status as ChatReportSummary['status'],
      createdAt: row.createdAt,
    };
  }
}
