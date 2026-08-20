import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  AppendMessageInput,
  AppendMessageResult,
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessage,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export { CHAT_MESSAGE_REPOSITORY_PORT };

/** Prisma 查出的訊息列 */
type MessageRow = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  seq: number;
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

  private readonly messageSelect = {
    id: true,
    roomId: true,
    senderId: true,
    content: true,
    seq: true,
    createdAt: true,
  } as const;

  private toMessage(row: MessageRow): ChatMessage {
    return {
      messageId: row.id,
      roomId: row.roomId,
      senderId: row.senderId,
      content: row.content,
      seq: row.seq,
      createdAt: row.createdAt,
    };
  }
}
