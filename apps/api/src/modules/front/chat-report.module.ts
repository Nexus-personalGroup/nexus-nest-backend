import { Module } from '@nestjs/common';
import { ChatReportController } from '../../adapter/in/web/front/chat-report/ChatReportController';
import { ChatReportFacade } from '../../application/facade/front/ChatReportFacade';
import { SUBMIT_REPORT_USE_CASE } from '../../application/port/in/front/chat-report/SubmitReportUseCase';
import { SubmitReportService } from '../../application/service/front/chat-report/SubmitReportService';
import { PrismaChatReportRepository } from '../../adapter/out/persistence/chat-report/PrismaChatReportRepository';
import { CHAT_REPORT_REPOSITORY_PORT } from '../../application/port/out/chat-report/ChatReportRepositoryPort';
import { ChatRoomCoreModule } from '../chat-room-core.module';
import { FrontAuthModule } from './auth.module';

/**
 * 前台檢舉模組（路由 `/api/front/chat-reports`）。
 *
 * 訊息的持久層與成員資格判斷都來自 `ChatRoomCoreModule`——它刻意不相依 WS，
 * 因此本模組也不需要。檢舉沒有任何推播：被檢舉者不得知情。
 */
@Module({
  // FrontAuthModule 提供 RESOLVE_USER_CONTEXT_USE_CASE（controller 的 FrontJwtAuthGuard）
  imports: [ChatRoomCoreModule, FrontAuthModule],
  controllers: [ChatReportController],
  providers: [
    PrismaChatReportRepository,
    {
      provide: CHAT_REPORT_REPOSITORY_PORT,
      useExisting: PrismaChatReportRepository,
    },
    { provide: SUBMIT_REPORT_USE_CASE, useClass: SubmitReportService },
    ChatReportFacade,
  ],
})
export class FrontChatReportModule {}
