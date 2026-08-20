import { Injectable } from '@nestjs/common';
import { Prisma, RoomType } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
  ChatRoomSummary,
  CreateDirectRoomInput,
  CreateGroupRoomInput,
  ListMyRoomsPage,
  ListMyRoomsParams,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';

// CHAT_ROOM_REPOSITORY_PORT re-export 方便 module 綁定一處 import
export { CHAT_ROOM_REPOSITORY_PORT };

/** Prisma 查出的房間列（含成員計數） */
type RoomRow = {
  id: string;
  roomType: RoomType;
  name: string | null;
  createdAt: Date;
  _count: { members: number };
};

@Injectable()
export class PrismaChatRoomRepository implements ChatRoomRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateDirect(
    input: CreateDirectRoomInput,
  ): Promise<ChatRoomSummary> {
    try {
      const room = await this.prisma.chatRoomRecord.create({
        data: {
          roomType: 'DIRECT',
          directKey: input.directKey,
          createdBy: input.createdBy,
          members: {
            create: input.memberIds.map((memberId) => ({ memberId })),
          },
        },
        select: this.summarySelect,
      });
      return this.toSummary(room);
    } catch (error) {
      // P2002 = 撞到 directKey 的 unique index，代表另一邊剛好同時建立了同一組私聊。
      // 這是正常結果而非錯誤：回傳既有房間，讓「重複建立」與「首次建立」對呼叫端一致。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.chatRoomRecord.findUniqueOrThrow({
          where: { directKey: input.directKey },
          select: this.summarySelect,
        });
        return this.toSummary(existing);
      }
      throw error;
    }
  }

  async createGroup(input: CreateGroupRoomInput): Promise<ChatRoomSummary> {
    const room = await this.prisma.chatRoomRecord.create({
      data: {
        roomType: 'GROUP',
        name: input.name,
        createdBy: input.createdBy,
        members: {
          create: [input.createdBy, ...input.memberIds].map((memberId) => ({
            memberId,
          })),
        },
      },
      select: this.summarySelect,
    });
    return this.toSummary(room);
  }

  async listByMember(params: ListMyRoomsParams): Promise<ListMyRoomsPage> {
    const where: Prisma.ChatRoomRecordWhereInput = {
      members: { some: { memberId: params.memberId } },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.chatRoomRecord.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: this.summarySelect,
      }),
      this.prisma.chatRoomRecord.count({ where }),
    ]);
    return { data: rows.map((row) => this.toSummary(row)), total };
  }

  async isMember(roomId: string, memberId: string): Promise<boolean> {
    const count = await this.prisma.chatRoomMemberRecord.count({
      where: { roomId, memberId },
    });
    return count > 0;
  }

  async removeMember(roomId: string, memberId: string): Promise<boolean> {
    // deleteMany 而非 delete：後者在找不到時拋 P2025，而「本來就不是成員」
    // 是預期中的輸入，不該用例外表達
    const { count } = await this.prisma.chatRoomMemberRecord.deleteMany({
      where: { roomId, memberId },
    });
    return count > 0;
  }

  countMembers(roomId: string): Promise<number> {
    return this.prisma.chatRoomMemberRecord.count({ where: { roomId } });
  }

  async getLastSeq(roomId: string): Promise<number | null> {
    const room = await this.prisma.chatRoomRecord.findUnique({
      where: { id: roomId },
      select: { lastSeq: true },
    });
    return room?.lastSeq ?? null;
  }

  private readonly summarySelect = {
    id: true,
    roomType: true,
    name: true,
    createdAt: true,
    _count: { select: { members: true } },
  } as const;

  private toSummary(row: RoomRow): ChatRoomSummary {
    return {
      id: row.id,
      roomType: row.roomType,
      name: row.name,
      memberCount: row._count.members,
      createdAt: row.createdAt,
    };
  }
}
