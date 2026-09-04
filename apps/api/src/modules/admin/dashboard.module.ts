import { Module } from '@nestjs/common';
import { DashboardController } from '../../adapter/in/web/admin/dashboard/DashboardController';
import { DashboardStream } from '../../adapter/in/web/admin/dashboard/DashboardStream';
import { GET_DASHBOARD_SNAPSHOT_USE_CASE } from '../../application/port/in/admin/dashboard/DashboardUseCases';
import { GetDashboardSnapshotService } from '../../application/service/admin/dashboard/GetDashboardSnapshotService';
import { PrismaChatReportRepository } from '../../adapter/out/persistence/chat-report/PrismaChatReportRepository';
import { CHAT_REPORT_REPOSITORY_PORT } from '../../application/port/out/chat-report/ChatReportRepositoryPort';
import { ChatRoomCoreModule } from '../chat-room-core.module';
import { UserPersistenceModule } from '../user-persistence.module';
import { MetricsModule } from '../metrics.module';

/**
 * 營運總覽模組（路由 `/api/admin/moderation/dashboard`）。
 *
 * 成員數計的是**前台使用者**，因此相依 `UserPersistenceModule`——
 * 儀表板回答的是聊天平台現在怎麼樣，後台管理員有幾個不屬於那個問題。
 *
 * 相依的是**持久層模組**而非整個帳號模組：這裡只需要計數，
 * 拉進整個帳號管理的模組樹沒有必要，而且那條路徑上還掛著 WS，
 * 會讓儀表板無謂地相依即時通訊。
 *
 * 檢舉的 repository 在這裡自行提供，與 `ModerationModule` 同樣的理由：
 * 兩者的相依方向不同，各自 provide 比開一個共用模組單純。
 */
@Module({
  imports: [ChatRoomCoreModule, UserPersistenceModule, MetricsModule],
  controllers: [DashboardController],
  providers: [
    PrismaChatReportRepository,
    {
      provide: CHAT_REPORT_REPOSITORY_PORT,
      useExisting: PrismaChatReportRepository,
    },
    {
      provide: GET_DASHBOARD_SNAPSHOT_USE_CASE,
      useClass: GetDashboardSnapshotService,
    },
    DashboardStream,
  ],
})
export class DashboardModule {}
