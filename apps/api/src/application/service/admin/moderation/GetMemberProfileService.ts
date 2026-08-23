import { Inject, Injectable } from '@nestjs/common';
import {
  GET_MEMBER_PROFILE_USE_CASE,
  GetMemberProfileUseCase,
  MemberProfile,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
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
import { MemberNotFoundException } from '@app/domain/exception/MemberNotFoundException';

export { GET_MEMBER_PROFILE_USE_CASE };

/**
 * 審閱視角的成員概覽。**對象是前台使用者（`users`）**——
 * 聊天的參與者不會是後台管理員，拿管理員的 ID 進來只會查不到。
 *
 * **本 service 刻意不注入稽核 port**——回應不含任何訊息內容，
 * 記了會讓稽核量與「點了幾下」對齊，而不是與「看到了什麼」對齊。
 * 這是型別層面的保證，不是「呼叫端記得不要寫」。
 *
 * 房間數與在線狀態都走既有的 port，不新寫查詢：同一個查詢寫兩份，
 * 日後改了一份忘了另一份就會產生兩種「房間清單」。
 */
@Injectable()
export class GetMemberProfileService implements GetMemberProfileUseCase {
  constructor(
    @Inject(LOAD_USER_PORT)
    private readonly userRepo: LoadUserPort,
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
    @Inject(CHAT_ROOM_REPOSITORY_PORT)
    private readonly roomRepo: ChatRoomRepositoryPort,
    @Inject(PRESENCE_PORT)
    private readonly presence: PresencePort,
  ) {}

  /**
   * 取某前台使用者的審閱概覽
   *
   * @param memberId - 前台使用者 ID
   * @returns 概覽資料
   * @throws MemberNotFoundException 該前台使用者不存在或已被軟刪除
   */
  async execute(memberId: string): Promise<MemberProfile> {
    const user = await this.userRepo.loadById(memberId);
    if (!user) throw new MemberNotFoundException(memberId);

    // 四個查詢彼此獨立，沒有必要排隊等
    const [reportedCount, submittedReportCount, rooms, isOnline] =
      await Promise.all([
        this.reportRepo.countByMember(memberId, 'TARGET'),
        this.reportRepo.countByMember(memberId, 'REPORTER'),
        // 只要總數，limit 取 1——這支 port 沒有純計數的版本，
        // 而為了一個數字新增一支方法不值得
        this.roomRepo.listByMember({ memberId, page: 1, limit: 1 }),
        this.presence.isOnline(memberId),
      ]);

    return {
      memberId: user.id,
      email: user.email,
      status: user.status,
      joinedAt: user.createdAt,
      isOnline,
      reportedCount,
      submittedReportCount,
      roomCount: rooms.total,
    };
  }
}
