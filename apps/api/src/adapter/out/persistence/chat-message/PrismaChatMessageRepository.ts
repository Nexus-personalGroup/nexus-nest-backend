import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  AppendMessageInput,
  AppendMessageResult,
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessage,
  ChatMessageRepositoryPort,
  MessageForReport,
  MessageOwnership,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export { CHAT_MESSAGE_REPOSITORY_PORT };

/** Prisma 查出的訊息列 */
type MessageRow = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  seq: number;
  retractedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class PrismaChatMessageRepository implements ChatMessageRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendMessageInput): Promise<AppendMessageResult> {
    try {
      const message = await this.prisma.$transaction(async (tx) => {
        // 配號與寫入在同一個交易內：分開做的話，中間失敗會讓號碼被吃掉而在 seq
        // 留下洞，補齊的客戶端無法區分「這個號碼被跳過」與「我漏收了」。
        // UPDATE 會對該房間的列取鎖，因此同一房間的併發寫入被序列化——那是刻意的，
        // 「每則訊息拿到唯一且連續的號碼」本來就無法平行。順帶讓 updatedAt 前進，
        // 房間列表的「最近有動靜優先」因此不需要額外欄位。
        const room = await tx.chatRoomRecord.update({
          where: { id: input.roomId },
          data: { lastSeq: { increment: 1 } },
          select: { lastSeq: true },
        });

        return tx.chatMessageRecord.create({
          data: {
            roomId: input.roomId,
            senderId: input.senderId,
            content: input.content,
            clientMessageId: input.clientMessageId,
            seq: room.lastSeq,
          },
          select: this.messageSelect,
        });
      });

      return { message: this.toMessage(message), deduplicated: false };
    } catch (error) {
      // P2002 = 撞到 (roomId, clientMessageId) 唯一索引，代表這是重送。
      // 交易已整個回滾，因此剛才那次遞增也一併還原——重送不會吃掉號碼。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.chatMessageRecord.findUniqueOrThrow({
          where: {
            roomId_clientMessageId: {
              roomId: input.roomId,
              clientMessageId: input.clientMessageId,
            },
          },
          select: this.messageSelect,
        });
        return { message: this.toMessage(existing), deduplicated: true };
      }
      throw error;
    }
  }

  async findAfterSeq(
    roomId: string,
    afterSeq: number,
    limit: number,
  ): Promise<ChatMessage[]> {
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: { roomId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
      select: this.messageSelect,
    });
    return rows.map((row) => this.toMessage(row));
  }

  async findBeforeSeq(
    roomId: string,
    beforeSeq: number | undefined,
    limit: number,
  ): Promise<ChatMessage[]> {
    const rows = await this.prisma.chatMessageRecord.findMany({
      where: {
        roomId,
        ...(beforeSeq === undefined ? {} : { seq: { lt: beforeSeq } }),
      },
      orderBy: { seq: 'desc' },
      take: limit,
      select: this.messageSelect,
    });
    return rows.map((row) => this.toMessage(row));
  }

  async findOwnership(
    roomId: string,
    messageId: string,
  ): Promise<MessageOwnership | null> {
    // 用 findFirst 帶 roomId 條件而非 findUnique(id)：訊息不屬於該房間時必須
    // 回 null，否則拿別的房間的 messageId 就能繞過房間層級的成員資格判斷
    const row = await this.prisma.chatMessageRecord.findFirst({
      where: { id: messageId, roomId },
      select: {
        id: true,
        senderId: true,
        createdAt: true,
        retractedAt: true,
      },
    });
    if (!row) return null;
    return {
      messageId: row.id,
      senderId: row.senderId,
      createdAt: row.createdAt,
      retractedAt: row.retractedAt,
    };
  }

  async findForReport(messageId: string): Promise<MessageForReport | null> {
    // 刻意不經過 toMessage()：檢舉需要的是**未遮蔽**的原始內容，
    // 因為被撤回的訊息也必須能被檢舉，而檢舉的價值在於留下當下那句話。
    // 這是唯一繞過遮蔽的路徑，範圍窄到只回傳檢舉會用到的四個欄位
    const row = await this.prisma.chatMessageRecord.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true, senderId: true, content: true },
    });
    if (!row) return null;
    return {
      messageId: row.id,
      roomId: row.roomId,
      senderId: row.senderId,
      rawContent: row.content,
    };
  }

  async retract(messageId: string, retractedBy: string): Promise<Date> {
    const now = new Date();
    // updateMany + retractedAt: null 條件讓「尚未撤回時才寫入」在單一 SQL 內完成，
    // 因此重複撤回不會覆寫原本的時間；受影響列數為 0 就代表早已撤回
    const { count } = await this.prisma.chatMessageRecord.updateMany({
      where: { id: messageId, retractedAt: null },
      data: { retractedAt: now, retractedBy },
    });
    if (count > 0) return now;

    const existing = await this.prisma.chatMessageRecord.findUniqueOrThrow({
      where: { id: messageId },
      select: { retractedAt: true },
    });
    // 走到這裡代表 count 為 0，也就是 retractedAt 必定有值
    return existing.retractedAt ?? now;
  }

  private readonly messageSelect = {
    id: true,
    roomId: true,
    senderId: true,
    content: true,
    seq: true,
    retractedAt: true,
    createdAt: true,
  } as const;

  /**
   * 資料列 → 對外物件的**唯一投影點**。
   *
   * 內容遮蔽只寫在這裡：被撤回的訊息內容保留在資料庫供 M3 的檢舉調查，
   * 但任何前台路徑都不得回傳它。讀取路徑有三條（歷史查詢、斷線補齊、即時廣播），
   * 在各個 service 各自遮蔽的話，漏掉一條就是洩漏，而且不會有徵兆。
   *
   * 空字串而非 null：`content` 的型別是 string，改成可空會讓所有客戶端多一個
   * null 檢查，而它們本來就要看 `retractedAt` 才知道要顯示「訊息已收回」。
   */
  private toMessage(row: MessageRow): ChatMessage {
    return {
      messageId: row.id,
      roomId: row.roomId,
      senderId: row.senderId,
      content: row.retractedAt ? '' : row.content,
      seq: row.seq,
      retractedAt: row.retractedAt,
      createdAt: row.createdAt,
    };
  }
}
