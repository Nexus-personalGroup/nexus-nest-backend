import { Module } from '@nestjs/common';
import { ModerationController } from '../../adapter/in/web/admin/moderation/ModerationController';
import { ModerationFacade } from '../../application/facade/admin/ModerationFacade';
import {
  GET_MEMBER_PROFILE_USE_CASE,
  GET_MEMBER_TIMELINE_USE_CASE,
  GET_REPORT_DETAIL_USE_CASE,
  LIST_MEMBER_REPORTS_USE_CASE,
  LIST_MEMBER_ROOMS_USE_CASE,
  LIST_REPORTS_USE_CASE,
  REVIEW_REPORT_USE_CASE,
} from '../../application/port/in/admin/moderation/ModerationUseCases';
import { ListReportsService } from '../../application/service/admin/moderation/ListReportsService';
import { GetReportDetailService } from '../../application/service/admin/moderation/GetReportDetailService';
import { ReviewReportService } from '../../application/service/admin/moderation/ReviewReportService';
import { GetMemberTimelineService } from '../../application/service/admin/moderation/GetMemberTimelineService';
import { GetMemberProfileService } from '../../application/service/admin/moderation/GetMemberProfileService';
import { ListMemberReportsService } from '../../application/service/admin/moderation/ListMemberReportsService';
import { ListMemberRoomsService } from '../../application/service/admin/moderation/ListMemberRoomsService';
import { RemoveMessageService } from '../../application/service/admin/moderation/RemoveMessageService';
import { RestoreMessageService } from '../../application/service/admin/moderation/RestoreMessageService';
import {
  REMOVE_MESSAGE_USE_CASE,
  RESTORE_MESSAGE_USE_CASE,
} from '../../application/port/in/admin/moderation/MessageModerationUseCases';
import { PrismaChatReportRepository } from '../../adapter/out/persistence/chat-report/PrismaChatReportRepository';
import { CHAT_REPORT_REPOSITORY_PORT } from '../../application/port/out/chat-report/ChatReportRepositoryPort';
import { ChatRoomCoreModule } from '../chat-room-core.module';
import { ChatWsModule } from '../chat-ws.module';
import { MemberModule } from './member.module';

/**
 * 後台檢舉審閱模組（路由 `/api/admin/moderation`）。
 *
 * 稽核 port 來自 `ChatRoomCoreModule`——它刻意不相依 WS，因此本模組也不需要。
 * 檢舉的 repository 在這裡自行提供：前台模組（`FrontChatReportModule`）提供的是
 * 同一個實作，但兩者的相依方向不同，各自 provide 比開一個共用模組單純。
 */
@Module({
  // ChatWsModule 提供 EVENT_PUBLISHER_PORT：移除與還原要推播讓畫面同步
  // MemberModule 提供 UPDATE_MEMBER_USE_CASE：停權與帳號管理走同一個 use case
  imports: [ChatRoomCoreModule, ChatWsModule, MemberModule],
  controllers: [ModerationController],
  providers: [
    PrismaChatReportRepository,
    {
      provide: CHAT_REPORT_REPOSITORY_PORT,
      useExisting: PrismaChatReportRepository,
    },
    { provide: LIST_REPORTS_USE_CASE, useClass: ListReportsService },
    { provide: GET_REPORT_DETAIL_USE_CASE, useClass: GetReportDetailService },
    { provide: REVIEW_REPORT_USE_CASE, useClass: ReviewReportService },
    {
      provide: GET_MEMBER_TIMELINE_USE_CASE,
      useClass: GetMemberTimelineService,
    },
    { provide: GET_MEMBER_PROFILE_USE_CASE, useClass: GetMemberProfileService },
    {
      provide: LIST_MEMBER_REPORTS_USE_CASE,
      useClass: ListMemberReportsService,
    },
    { provide: LIST_MEMBER_ROOMS_USE_CASE, useClass: ListMemberRoomsService },
    { provide: REMOVE_MESSAGE_USE_CASE, useClass: RemoveMessageService },
    { provide: RESTORE_MESSAGE_USE_CASE, useClass: RestoreMessageService },
    ModerationFacade,
  ],
})
export class ModerationModule {}
