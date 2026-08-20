export const CHAT_ROOM_READ_REPOSITORY_PORT = 'CHAT_ROOM_READ_REPOSITORY_PORT';

export interface ChatRoomReadRepositoryPort {
  /**
   * 把已讀位置前進到指定的 seq；若目前值已經大於等於它則不動。
   *
   * **「只增不減」必須在單一 SQL 內完成。** 先讀再比再寫會有競態：
   * 兩個裝置同時回報時，較舊的那個可能後寫入而讓已讀倒退，
   * 症狀是「已讀了又變成未讀」，且只在多裝置情境偶發。
   *
   * @returns true 代表確實前進了（呼叫端據此決定要不要推播）
   */
  markRead(roomId: string, memberId: string, seq: number): Promise<boolean>;
}
