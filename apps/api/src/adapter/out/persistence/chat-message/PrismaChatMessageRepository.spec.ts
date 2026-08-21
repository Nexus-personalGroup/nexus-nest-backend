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
  retractedAt: null,
  removedAt: null,
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

  describe('撤回', () => {
    let updateMany: jest.Mock;
    let findFirst: jest.Mock;
    let findUniqueOrThrow2: jest.Mock;

    beforeEach(() => {
      updateMany = jest.fn().mockResolvedValue({ count: 1 });
      findFirst = jest.fn();
      findUniqueOrThrow2 = jest.fn();
      prisma = {
        chatMessageRecord: {
          updateMany,
          findFirst,
          findUniqueOrThrow: findUniqueOrThrow2,
        },
      } as unknown as PrismaService;
      repo = new PrismaChatMessageRepository(prisma);
    });

    // 拿別的房間的 messageId 就能繞過房間層級的成員資格判斷
    it('findOwnership 以 roomId + id 查詢，不只看 id', async () => {
      findFirst.mockResolvedValue(null);
      await repo.findOwnership('room-1', 'msg-1');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'msg-1', roomId: 'room-1' } }),
      );
    });

    // 這條路徑只需要「誰發的、何時發的、是否已撤回」；
    // 多取內容等於在授權判斷之前就把它撈出來
    it('findOwnership 不取 content', async () => {
      findFirst.mockResolvedValue(null);
      await repo.findOwnership('room-1', 'msg-1');

      const [args] = findFirst.mock.calls[0] as [{ select: object }];
      expect(args.select).not.toHaveProperty('content');
    });

    // 刪除該列會讓 seq 出現洞，補齊的客戶端無法區分「被撤回」與「我漏收了」
    it('retract 是標記而非刪除', async () => {
      await repo.retract('msg-1', 'me');

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ retractedBy: 'me' }),
        }),
      );
    });

    // 條件寫在 SQL 裡才是原子的；讀-比-寫會讓並發的兩次撤回互相覆寫時間
    it('retract 只在尚未撤回時寫入', async () => {
      await repo.retract('msg-1', 'me');

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1', retractedAt: null },
        }),
      );
    });

    it('已撤回時回傳原本的時間，不覆寫', async () => {
      const original = new Date('2026-08-21T00:00:00.000Z');
      updateMany.mockResolvedValue({ count: 0 });
      findUniqueOrThrow2.mockResolvedValue({ retractedAt: original });

      expect(await repo.retract('msg-1', 'me')).toEqual(original);
    });
  });

  describe('內容遮蔽（唯一投影點）', () => {
    const retractedRow = {
      ...row,
      content: '這段內容必須保留在資料庫但不得外流',
      retractedAt: new Date('2026-08-21T00:00:00.000Z'),
    };

    beforeEach(() => {
      prisma = {
        chatMessageRecord: {
          findMany: jest.fn().mockResolvedValue([retractedRow]),
        },
      } as unknown as PrismaService;
      repo = new PrismaChatMessageRepository(prisma);
    });

    // 讀取路徑有三條，遮蔽只寫在投影函式一處；漏掉任何一條都是內容洩漏
    it('findAfterSeq（斷線補齊）遮蔽已撤回的內容', async () => {
      const [message] = await repo.findAfterSeq('room-1', 0, 10);

      expect(message.content).toBe('');
      expect(message.retractedAt).toEqual(retractedRow.retractedAt);
    });

    it('findBeforeSeq（歷史查詢）遮蔽已撤回的內容', async () => {
      const [message] = await repo.findBeforeSeq('room-1', undefined, 10);

      expect(message.content).toBe('');
    });

    // 濾掉的話 seq 會出現洞，客戶端無法區分「被撤回」與「我漏收了」
    it('已撤回的訊息仍出現在結果中，seq 保留', async () => {
      const messages = await repo.findAfterSeq('room-1', 0, 10);

      expect(messages).toHaveLength(1);
      expect(messages[0].seq).toBe(retractedRow.seq);
    });

    it('未撤回的訊息內容原樣回傳', async () => {
      (prisma.chatMessageRecord.findMany as jest.Mock).mockResolvedValue([row]);

      const [message] = await repo.findAfterSeq('room-1', 0, 10);

      expect(message.content).toBe(row.content);
      expect(message.retractedAt).toBeNull();
    });
  });

  /**
   * 管理員移除的遮蔽與還原。
   *
   * 遮蔽只寫在 `toMessage()` 一處，但**讀取路徑有兩條**（歷史、補齊）——
   * 上一次的反向驗證證明它們要分別測：只驗一條時，另一條的迴歸不會被發現。
   */
  describe('移除', () => {
    const removedRow = {
      ...row,
      content: '被管理員移除的內容',
      removedAt: new Date('2026-08-21T00:00:00.000Z'),
    };

    beforeEach(() => {
      prisma = {
        chatMessageRecord: {
          findMany: jest.fn().mockResolvedValue([removedRow]),
        },
      } as unknown as PrismaService;
      repo = new PrismaChatMessageRepository(prisma);
    });

    it('findBeforeSeq（歷史查詢）遮蔽已移除的內容', async () => {
      const [message] = await repo.findBeforeSeq('room-1', undefined, 10);

      expect(message.content).toBe('');
      expect(message.removedAt).toEqual(removedRow.removedAt);
    });

    it('findAfterSeq（斷線補齊）遮蔽已移除的內容', async () => {
      const [message] = await repo.findAfterSeq('room-1', 0, 10);

      expect(message.content).toBe('');
    });

    // 濾掉會讓 seq 出現洞，客戶端無法區分「被移除」與「我漏收了」
    it('已移除的訊息仍出現在結果中，seq 保留', async () => {
      const messages = await repo.findAfterSeq('room-1', 0, 10);

      expect(messages).toHaveLength(1);
      expect(messages[0].seq).toBe(removedRow.seq);
    });

    // 兩個標記可以同時存在（撤回後仍可被移除）
    it('同時被撤回與移除時仍遮蔽，兩個欄位都有值', async () => {
      (prisma.chatMessageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          ...removedRow,
          retractedAt: new Date('2026-08-20T00:00:00.000Z'),
        },
      ]);

      const [message] = await repo.findAfterSeq('room-1', 0, 10);

      expect(message.content).toBe('');
      expect(message.retractedAt).not.toBeNull();
      expect(message.removedAt).not.toBeNull();
    });

    it('未撤回也未移除的內容原樣回傳', async () => {
      (prisma.chatMessageRecord.findMany as jest.Mock).mockResolvedValue([row]);

      const [message] = await repo.findAfterSeq('room-1', 0, 10);

      expect(message.content).toBe(row.content);
      expect(message.removedAt).toBeNull();
    });
  });

  describe('移除與還原的寫入', () => {
    let updateMany: jest.Mock;
    let findUniqueOrThrow3: jest.Mock;

    beforeEach(() => {
      updateMany = jest.fn().mockResolvedValue({ count: 1 });
      findUniqueOrThrow3 = jest.fn().mockResolvedValue({ retractedAt: null });
      prisma = {
        chatMessageRecord: {
          updateMany,
          findUniqueOrThrow: findUniqueOrThrow3,
        },
      } as unknown as PrismaService;
      repo = new PrismaChatMessageRepository(prisma);
    });

    // 條件寫在 SQL 裡才是原子的；讀-比-寫會讓並發的兩次移除互相覆寫時間
    it('remove 只在尚未移除時寫入', async () => {
      await repo.remove('msg-1', 'admin');

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'msg-1', removedAt: null } }),
      );
    });

    it('已移除時回 null（呼叫端據此不重複推播）', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      expect(await repo.remove('msg-1', 'admin')).toBeNull();
    });

    it('restore 只在已移除時清除標記', async () => {
      await repo.restore('msg-1');

      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1', removedAt: { not: null } },
        }),
      );
    });

    // 還原不該讓「使用者曾經自己收回」這件事消失
    it('restore 不碰 retractedAt', async () => {
      await repo.restore('msg-1');

      const [args] = updateMany.mock.calls[0] as [{ data: object }];
      expect(args.data).not.toHaveProperty('retractedAt');
    });

    it('restore 回傳還原後的撤回狀態', async () => {
      const retractedAt = new Date('2026-08-20T00:00:00.000Z');
      findUniqueOrThrow3.mockResolvedValue({ retractedAt });

      expect(await repo.restore('msg-1')).toEqual({ retractedAt });
    });

    it('本來就沒被移除時回 null', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      expect(await repo.restore('msg-1')).toBeNull();
    });
  });
});
