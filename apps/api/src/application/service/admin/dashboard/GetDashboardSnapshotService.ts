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
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '@app/application/port/out/member/LoadMemberPort';
import {
  PRESENCE_PORT,
  PresencePort,
} from '@app/application/port/out/presence/PresencePort';
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
    @Inject(LOAD_MEMBER_PORT) private readonly memberRepo: LoadMemberPort,
    @Inject(CHAT_MESSAGE_REPOSITORY_PORT)
    private readonly messageRepo: ChatMessageRepositoryPort,
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
      this.presence.countOnlineMembers(),
      this.reportRepo.countByStatus('PENDING'),
      this.roomRepo.countRooms(),
      this.memberRepo.countMembers(),
      this.messageRepo.countSince(this.todayStart()),
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
