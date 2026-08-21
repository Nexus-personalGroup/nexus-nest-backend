import { Module } from '@nestjs/common';
import { ModerationController } from '../../adapter/in/web/admin/moderation/ModerationController';
import { ModerationFacade } from '../../application/facade/admin/ModerationFacade';
import {
  GET_MEMBER_TIMELINE_USE_CASE,
  GET_REPORT_DETAIL_USE_CASE,
  LIST_REPORTS_USE_CASE,
  REVIEW_REPORT_USE_CASE,
} from '../../application/port/in/admin/moderation/ModerationUseCases';
import { ListReportsService } from '../../application/service/admin/moderation/ListReportsService';
import { GetReportDetailService } from '../../application/service/admin/moderation/GetReportDetailService';
import { ReviewReportService } from '../../application/service/admin/moderation/ReviewReportService';
import { GetMemberTimelineService } from '../../application/service/admin/moderation/GetMemberTimelineService';
import { PrismaChatReportRepository } from '../../adapter/out/persistence/chat-report/PrismaChatReportRepository';
import { CHAT_REPORT_REPOSITORY_PORT } from '../../application/port/out/chat-report/ChatReportRepositoryPort';
import { ChatRoomCoreModule } from '../chat-room-core.module';

/**
 * 後台檢舉審閱模組（路由 `/api/admin/moderation`）。
 *
 * 稽核 port 來自 `ChatRoomCoreModule`——它刻意不相依 WS，因此本模組也不需要。
 * 檢舉的 repository 在這裡自行提供：前台模組（`FrontChatReportModule`）提供的是
 * 同一個實作，但兩者的相依方向不同，各自 provide 比開一個共用模組單純。
 */
@Module({
  imports: [ChatRoomCoreModule],
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
    ModerationFacade,
  ],
})
export class ModerationModule {}
