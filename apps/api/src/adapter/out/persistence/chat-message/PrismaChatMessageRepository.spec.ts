import { Prisma } from '@prisma/client';
import { PrismaChatMessageRepository } from './PrismaChatMessageRepository';
import type { PrismaService } from '@app/infrastructure/prisma/prisma.service';

/** 交易內可用的兩個 model 操作 */
type Tx = {
  chatRoomRecord: { update: jest.Mock };
  chatMessageRecord: { create: jest.Mock };
};

const p2002 = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
  });

const row = {
  id: 'msg-1',
  roomId: 'room-1',
  senderId: 'me',
  content: '午餐吃什麼',
  seq: 42,
  createdAt: new Date(0),
};

const input = {
  roomId: 'room-1',
  senderId: 'me',
  content: '午餐吃什麼',
  clientMessageId: 'client-1',
};

describe('PrismaChatMessageRepository', () => {
  let tx: Tx;
  let prisma: PrismaService;
  let repo: PrismaChatMessageRepository;
  let findUniqueOrThrow: jest.Mock;

  beforeEach(() => {
    tx = {
      chatRoomRecord: { update: jest.fn().mockResolvedValue({ lastSeq: 42 }) },
      chatMessageRecord: { create: jest.fn().mockResolvedValue(row) },
    };
    findUniqueOrThrow = jest.fn().mockResolvedValue(row);
    prisma = {
      // 真實的 $transaction 會把同一個 tx 交給 callback；這裡照做，
      // 才驗得出「配號與寫入用的是同一個交易」
      $transaction: jest.fn((cb: (t: Tx) => unknown) => cb(tx)),
      chatMessageRecord: { findUniqueOrThrow },
    } as unknown as PrismaService;
    repo = new PrismaChatMessageRepository(prisma);
  });

  describe('append', () => {
    it('回傳寫入的訊息，並標記非重送', async () => {
      const result = await repo.append(input);

      expect(result.deduplicated).toBe(false);
      expect(result.message.messageId).toBe('msg-1');
      expect(result.message.seq).toBe(42);
    });

    /**
     * 這條是本 repository 存在的理由。
     *
     * 配號與寫入分成兩個交易時，中間失敗會讓號碼被吃掉而在 seq 留下洞，
     * 補齊的客戶端無法區分「這個號碼被跳過」與「我漏收了」——
     * 而症狀是「偶爾少一則訊息」，幾乎不可能從線上重現。
     */
    it('配號與寫入在同一個交易內完成', async () => {
      await repo.append(input);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.chatRoomRecord.update).toHaveBeenCalledTimes(1);
      expect(tx.chatMessageRecord.create).toHaveBeenCalledTimes(1);
    });

    it('以 UPDATE … increment 配號，不先讀再寫', async () => {
      await repo.append(input);

      expect(tx.chatRoomRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'room-1' },
          data: { lastSeq: { increment: 1 } },
        }),
      );
    });

    it('訊息的 seq 取自配號結果，不自行計算', async () => {
      tx.chatRoomRecord.update.mockResolvedValue({ lastSeq: 7 });

      await repo.append(input);

      expect(tx.chatMessageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ seq: 7 }),
        }),
      );
    });

    it('撞唯一索引（P2002）時回傳既有訊息並標記重送', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(p2002());

      const result = await repo.append(input);

      expect(result.deduplicated).toBe(true);
      expect(result.message.messageId).toBe('msg-1');
      expect(findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            roomId_clientMessageId: {
              roomId: 'room-1',
              clientMessageId: 'client-1',
            },
          },
        }),
      );
    });

    // 只吞 P2002。其他錯誤被吞掉的話，寫入失敗會被當成「重送成功」，
    // 使用者看到一則實際不存在的訊息
    it('非 P2002 的錯誤原樣往上拋', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('DB 掛了'),
      );

      await expect(repo.append(input)).rejects.toThrow('DB 掛了');
      expect(findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('查詢', () => {
    beforeEach(() => {
      prisma = {
        chatMessageRecord: { findMany: jest.fn().mockResolvedValue([row]) },
      } as unknown as PrismaService;
      repo = new PrismaChatMessageRepository(prisma);
    });

    it('findAfterSeq 由舊到新——補齊要接在斷點之後', async () => {
      await repo.findAfterSeq('room-1', 40, 10);

      expect(prisma.chatMessageRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: 'room-1', seq: { gt: 40 } },
          orderBy: { seq: 'asc' },
          take: 10,
        }),
      );
    });

    it('findBeforeSeq 由新到舊——歷史是從最新往回捲', async () => {
      await repo.findBeforeSeq('room-1', 40, 10);

      expect(prisma.chatMessageRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: 'room-1', seq: { lt: 40 } },
          orderBy: { seq: 'desc' },
        }),
      );
    });

    it('findBeforeSeq 未指定游標時不加 seq 條件', async () => {
      await repo.findBeforeSeq('room-1', undefined, 10);

      expect(prisma.chatMessageRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { roomId: 'room-1' } }),
      );
    });
  });
});
