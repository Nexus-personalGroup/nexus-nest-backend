import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  CHAT_ROOM_READ_REPOSITORY_PORT,
  ChatRoomReadRepositoryPort,
} from '@app/application/port/out/chat-message/ChatRoomReadRepositoryPort';

export { CHAT_ROOM_READ_REPOSITORY_PORT };

@Injectable()
export class PrismaChatRoomReadRepository implements ChatRoomReadRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async markRead(
    roomId: string,
    memberId: string,
    seq: number,
  ): Promise<boolean> {
    // 用 raw SQL 而非 Prisma 的 upsert：upsert 表達不了「只在更大時才更新」，
    // 而拆成讀-比-寫就會有競態——兩個裝置同時回報時，較舊的可能後寫入
    // 而讓已讀倒退。ON CONFLICT ... WHERE 讓整件事在一次 SQL 內原子完成。
    // 回傳的受影響列數為 0 就代表沒有前進。
    const affected = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO chat_room_reads (room_id, member_id, last_read_seq, updated_at)
      VALUES (${roomId}::uuid, ${memberId}, ${seq}, NOW())
      ON CONFLICT (room_id, member_id) DO UPDATE
        SET last_read_seq = EXCLUDED.last_read_seq, updated_at = NOW()
        WHERE chat_room_reads.last_read_seq < EXCLUDED.last_read_seq
    `);
    return affected > 0;
  }
}
