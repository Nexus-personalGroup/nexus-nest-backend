import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ChatReportFacade } from '@app/application/facade/front/ChatReportFacade';
import type { ChatReportSummary } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import type { MemberContext } from '@app/application/port/member-context';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { CurrentMember } from '../../decorator/current-member.decorator';
import { MemberScoped } from '../../decorator/member-scoped.decorator';
import { submitReportSchema, SubmitReportRequest } from './SubmitReportRequest';

/**
 * 前台檢舉。
 *
 * 只有一支端點，而且**沒有查詢端點**：被檢舉者不得知道自己被檢舉，
 * 檢舉人也不需要回頭查（處置結果的通知要等「處置」這個概念存在）。
 * 佇列的讀取屬於後台，走 RBAC。
 */
@MemberScoped()
@Controller('front/chat-reports')
export class ChatReportController {
  constructor(private readonly chatReportFacade: ChatReportFacade) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  submitReport(
    @CurrentMember() member: MemberContext,
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
