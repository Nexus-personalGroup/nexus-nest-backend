import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChatReportFacade } from '@app/application/facade/front/ChatReportFacade';
import type { ChatReportSummary } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { UserContext } from '@app/application/port/user-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { Public } from '../../decorator/public.decorator';
import { FrontJwtAuthGuard } from '../../guard/FrontJwtAuthGuard';
import { EmailVerifiedGuard } from '../../guard/EmailVerifiedGuard';
import { MemberScoped } from '../../decorator/member-scoped.decorator';
import { submitReportSchema, SubmitReportRequest } from './SubmitReportRequest';

/**
 * 前台檢舉。
 *
 * 只有一支端點，而且**沒有查詢端點**：被檢舉者不得知道自己被檢舉，
 * 檢舉人也不需要回頭查（處置結果的通知要等「處置」這個概念存在）。
 * 佇列的讀取屬於後台，走 RBAC。 *
 * `@Public()` 是給**全域的後台 Guard** 看的（讓它略過這些路由），
 * 實際的認證由 `FrontJwtAuthGuard` 執行——它刻意不檢查 `@Public()`，
 * 兩者合起來才是「這支端點吃前台 token」。
 *
 * `EmailVerifiedGuard` 是第三道：聊天要求信箱已驗證。**順序有意義**——
 * 它讀的 `request.frontUser` 由 `FrontJwtAuthGuard` 設定。
 */
@MemberScoped()
@Public()
@UseGuards(FrontJwtAuthGuard, EmailVerifiedGuard)
@Controller('front/chat-reports')
export class ChatReportController {
  constructor(private readonly chatReportFacade: ChatReportFacade) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  submitReport(
    @CurrentUser() member: UserContext,
    @Body(new ZodValidationPipe(submitReportSchema)) dto: SubmitReportRequest,
  ): Promise<ChatReportSummary> {
    // 回 200 而非 201：重複檢舉回傳既有那筆，此時沒有任何東西被建立
    return this.chatReportFacade.submitReport({
      reporterId: member.sub,
      messageId: dto.messageId,
      reason: dto.reason,
      description: dto.description,
    });
  }
}
