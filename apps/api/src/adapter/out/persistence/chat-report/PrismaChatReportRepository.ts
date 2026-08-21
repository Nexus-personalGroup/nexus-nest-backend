import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportDetail,
  ChatReportListItem,
  ChatReportReason,
  ChatReportRepositoryPort,
  ChatReportStatus,
  ChatReportSummary,
  CreateReportInput,
  ListReportsPage,
  ListReportsParams,
  UpdateReportStatusInput,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';

export { CHAT_REPORT_REPOSITORY_PORT };

/** Prisma 查出的檢舉列（僅回應會用到的欄位；快照不外流） */
type ReportRow = {
  id: string;
  status: ChatReportStatus;
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

  async list(params: ListReportsParams): Promise<ListReportsPage> {
    const where = { status: params.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.chatReportRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: this.listSelect,
      }),
      this.prisma.chatReportRecord.count({ where }),
    ]);
    return { data: rows.map((row) => this.toListItem(row)), total };
  }

  async findDetail(reportId: string): Promise<ChatReportDetail | null> {
    const row = await this.prisma.chatReportRecord.findUnique({
      where: { id: reportId },
      select: { ...this.listSelect, ...this.detailSelect },
    });
    if (!row) return null;
    return {
      ...this.toListItem(row),
      targetMessageId: row.targetMessageId,
      description: row.description,
      contentSnapshot: row.contentSnapshot,
      reviewedAt: row.reviewedAt,
      reviewedBy: row.reviewedBy,
      reviewNote: row.reviewNote,
    };
  }

  async updateStatus(input: UpdateReportStatusInput): Promise<boolean> {
    // updateMany 而非 update：後者在找不到時拋 P2025，而「檢舉不存在」
    // 是預期中的輸入，不該用例外表達
    const { count } = await this.prisma.chatReportRecord.updateMany({
      where: { id: input.reportId },
      data: {
        status: input.status,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
        reviewNote: input.reviewNote ?? null,
      },
    });
    return count > 0;
  }

  /**
   * 列表用的欄位。
   *
   * **刻意不含 `contentSnapshot`。** 這是最容易「順手 select 全部」的地方，
   * 而一旦選了它，列表就會在網路上帶著一整頁敏感內容——包含已被撤回的訊息。
   */
  private readonly listSelect = {
    id: true,
    reporterId: true,
    targetMemberId: true,
    roomId: true,
    reason: true,
    status: true,
    createdAt: true,
  } as const;

  /** 詳情才有的欄位；讀它的路徑必須留稽核 */
  private readonly detailSelect = {
    targetMessageId: true,
    description: true,
    contentSnapshot: true,
    reviewedAt: true,
    reviewedBy: true,
    reviewNote: true,
  } as const;

  private toListItem(row: {
    id: string;
    reporterId: string;
    targetMemberId: string;
    roomId: string;
    reason: ChatReportReason;
    status: ChatReportStatus;
    createdAt: Date;
  }): ChatReportListItem {
    return {
      reportId: row.id,
      reporterId: row.reporterId,
      targetMemberId: row.targetMemberId,
      roomId: row.roomId,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  // 建立時只回這三個欄位：前台不需要更多，回應也不該有機會帶上快照
  private readonly summarySelect = {
    id: true,
    status: true,
    createdAt: true,
  } as const;

  private toSummary(row: ReportRow): ChatReportSummary {
    return {
      reportId: row.id,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
