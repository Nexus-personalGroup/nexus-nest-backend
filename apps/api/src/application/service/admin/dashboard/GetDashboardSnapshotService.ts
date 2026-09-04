import { Inject, Injectable } from '@nestjs/common';
import {
  GET_DASHBOARD_SNAPSHOT_USE_CASE,
  DashboardSnapshot,
  GetDashboardSnapshotUseCase,
} from '@app/application/port/in/admin/dashboard/DashboardUseCases';
import {
  CHAT_MESSAGE_REPOSITORY_PORT,
  ChatMessageRepositoryPort,
} from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  CHAT_ROOM_REPOSITORY_PORT,
  ChatRoomRepositoryPort,
} from '@app/application/port/out/chat-room/ChatRoomRepositoryPort';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import {
  PRESENCE_PORT,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
import {
  METRICS_PORT,
  MetricsPort,
  type DashboardQuery,
} from '@app/application/port/out/MetricsPort';
import { appDayStartUtc, formatDate } from '@app/infrastructure/date';

export { GET_DASHBOARD_SNAPSHOT_USE_CASE };

/**
 * 營運總覽的快照。
 *
 * **本 service 不注入稽核 port**：回應只有聚合數字，不含任何個人或訊息內容。
 */
@Injectable()
export class GetDashboardSnapshotService implements GetDashboardSnapshotUseCase {
  constructor(
    @Inject(PRESENCE_PORT) private readonly presence: PresencePort,
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly roomRepo: ChatRoomRepositoryPort,
    @Inject(LOAD_USER_PORT) private readonly userRepo: LoadUserPort,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
    @Inject(METRICS_PORT) private readonly metrics: MetricsPort,
  ) {}

  async execute(): Promise<DashboardSnapshot> {
    // 五個查詢彼此獨立，沒有必要排隊等
    const [
      onlineMembers,
      pendingReports,
      totalRooms,
      totalMembers,
      messagesToday,
    ] = await Promise.all([
      this.measured('online-members', () => this.presence.countOnlineMembers()),
      this.measured('pending-reports', () =>
        this.reportRepo.countByStatus('PENDING'),
      ),
      this.measured('total-rooms', () => this.roomRepo.countRooms()),
      this.measured('total-members', () => this.userRepo.countUsers()),
      this.measured('messages-today', () =>
        this.messageRepo.countSince(this.todayStart()),
      ),
    ]);

    return {
      onlineMembers,
      pendingReports,
      totalRooms,
      totalMembers,
      messagesToday,
      generatedAt: new Date(),
    };
  }

  /**
   * 量測單一查詢的耗時並回報指標。
   *
   * 逐個查詢量而不是量整份快照：總耗時說得出「慢」，說不出「該修哪一個」，
   * 而修法的選項（加索引 / 改寫查詢 / 快取）代價各不相同。
   *
   * **失敗不記錄**：耗時到一半就拋出的查詢，它的數字不代表「這個查詢多久」，
   * 混進直方圖只會讓分位數失真。錯誤本身由呼叫端的例外處理負責。
   *
   * @param query - 查詢名（封閉集合，作為指標標籤）
   * @param run - 實際的查詢
   * @returns 查詢結果
   */
  private async measured<T>(
    query: DashboardQuery,
    run: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    const result = await run();
    this.metrics.observeDashboardQuerySeconds(
      query,
      (Date.now() - startedAt) / 1_000,
    );
    return result;
  }

  /**
   * 今天的起點（UTC instant）
   *
   * **日界依 `APP_TIMEZONE` 而非 UTC**：UTC 午夜對台灣是早上八點，
   * 用 UTC 會讓「今日訊息數」在早上八點莫名其妙歸零——
   * 而那種錯誤只在特定時段出現，很難被回報。
   */
  private todayStart(): Date {
    return appDayStartUtc(formatDate(new Date()));
  }
}
