export const PRESENCE_PORT = 'PRESENCE_PORT';

/** 一條在線連線。`instanceId` 讓同一成員在不同實例上的連線可以被區分 */
export interface PresenceConnection {
  instanceId: string;
  socketId: string;
  /** 最後心跳時間（epoch ms） */
  lastSeenAt: number;
}

/**
 * 在線狀態
 *
 * 存放於 Redis 而非行程記憶體，使任一實例都能查詢到完整的在線集合。
 * 前一版專案用行程內的 `Map`，開第二個實例後在線狀態就各說各話。
 *
 * 每筆紀錄都帶最後心跳時間，因此**實例被強制終止時不需要任何協調機制**——
 * 它留下的紀錄會因為停止續期而自動被判定為陳舊。
 */
export interface PresencePort {
  /**
   * 記錄一條新連線
   *
   * @returns 該成員在此之前是否為離線（true 代表這是「上線」而非「多開一個裝置」）
   */
  markOnline(
    memberId: string,
    instanceId: string,
    socketId: string,
  ): Promise<boolean>;

  /**
   * 移除一條連線
   *
   * @returns 該成員是否已無任何連線（true 代表真正離線）
   */
  markOffline(
    memberId: string,
    instanceId: string,
    socketId: string,
  ): Promise<boolean>;

  /** 續期一條連線。同時更新該連線的心跳時間與整個成員紀錄的 TTL */
  heartbeat(
    memberId: string,
    instanceId: string,
    socketId: string,
  ): Promise<void>;

  /** 該成員是否還有未逾時的連線 */
  isOnline(memberId: string): Promise<boolean>;

  /** 該成員目前所有未逾時的連線 */
  getConnections(memberId: string): Promise<PresenceConnection[]>;

  /**
   * 清除所有成員的陳舊連線紀錄
   *
   * 讀取時的過濾只是讓陳舊紀錄不被採信，實體資料仍佔著空間；由排程定期實際刪除。
   *
   * @returns 被刪除的連線筆數
   */
  sweepStale(): Promise<number>;
}
