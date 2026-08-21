import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ModerationFacade } from '@app/application/facade/admin/ModerationFacade';
import type {
  GetMemberTimelineResult,
  ListMemberReportsResult,
  ListMemberRoomsResult,
  ListReportsResult,
  MemberProfile,
  ReportDetailView,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import type { MemberContext } from '@app/application/port/member-context';
import { PermissionCode } from '@app/domain/value-object/Role';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { PermissionsGuard } from '../../guard/PermissionsGuard';
import { Permissions } from '../../decorator/permissions.decorator';
import { CurrentMember } from '../../decorator/current-member.decorator';
import {
  listReportsQuerySchema,
  ListReportsQuery,
  memberReportsQuerySchema,
  MemberReportsQuery,
  reviewReportSchema,
  ReviewReportRequest,
  timelineQuerySchema,
  TimelineQuery,
} from './ModerationQueries';

/**
 * 後台檢舉審閱。
 *
 * VIEW 與 EDIT 分開的理由是**兩者的風險不同**：查看會接觸到敏感內容
 * （含被撤回的訊息快照），判定會改變狀態。「能看的人」與「能判的人」
 * 在真實團隊裡經常不是同一群。
 */
@Controller('admin/moderation')
@UseGuards(PermissionsGuard)
export class ModerationController {
  constructor(private readonly moderationFacade: ModerationFacade) {}

  @Get('reports')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  listReports(
    @Query(new ZodValidationPipe(listReportsQuerySchema))
    query: ListReportsQuery,
  ): Promise<ListReportsResult> {
    return this.moderationFacade.listReports(query);
  }

  /**
   * 單筆詳情——**唯一能看到被撤回訊息內容的路徑，因此每次呼叫都會留稽核**。
   *
   * 查看者由 `@CurrentMember()` 帶入，不接受客戶端指定：
   * 稽核紀錄的可信度完全建立在「那真的是他」之上。
   */
  @Get('reports/:reportId')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  getReportDetail(
    @CurrentMember() member: MemberContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ): Promise<ReportDetailView> {
    return this.moderationFacade.getReportDetail({
      reportId,
      viewerId: member.sub,
    });
  }

  @Patch('reports/:reportId')
  @Permissions(PermissionCode.BACKEND_MODERATION_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reviewReport(
    @CurrentMember() member: MemberContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(new ZodValidationPipe(reviewReportSchema)) dto: ReviewReportRequest,
  ): Promise<void> {
    await this.moderationFacade.reviewReport({
      reportId,
      status: dto.status,
      reviewerId: member.sub,
      reviewNote: dto.reviewNote,
    });
  }

  /**
   * 移除違規訊息。
   *
   * **不要求該訊息被檢舉過**：管理員可能從私訊、主動巡邏等管道發現違規內容。
   * 移除的授權來自 RBAC，不來自檢舉的存在。
   */
  @Delete('messages/:messageId')
  @Permissions(PermissionCode.BACKEND_MODERATION_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMessage(
    @CurrentMember() member: MemberContext,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.moderationFacade.removeMessage({
      messageId,
      moderatorId: member.sub,
    });
  }

  /**
   * 還原被誤移除的訊息。
   *
   * 誤判在審閱情境是真實的——沒有回頭路會讓管理員傾向不敢處理，
   * 而一個不敢用的工具等於沒有工具。還原同樣留稽核。
   */
  @Post('messages/:messageId/restore')
  @Permissions(PermissionCode.BACKEND_MODERATION_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async restoreMessage(
    @CurrentMember() member: MemberContext,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.moderationFacade.restoreMessage({
      messageId,
      moderatorId: member.sub,
    });
  }

  /**
   * 停權成員（審閱側入口）。
   *
   * 與帳號管理的 `PATCH /api/admin/members/:id { status: false }` 效果完全相同——
   * 兩者呼叫同一個 use case。**刻意並存**：「能管帳號的人」與「能做審閱處置的人」
   * 是不同的角色，客服能停權違規者但不該改帳號的角色與密碼。
   */
  @Post('members/:memberId/suspend')
  @Permissions(PermissionCode.BACKEND_MODERATION_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspendMember(
    @CurrentMember() member: MemberContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.moderationFacade.suspendMember(memberId, member.sub);
  }

  @Post('members/:memberId/reinstate')
  @Permissions(PermissionCode.BACKEND_MODERATION_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reinstateMember(
    @CurrentMember() member: MemberContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.moderationFacade.reinstateMember(memberId, member.sub);
  }

  /**
   * 審閱視角的成員概覽。
   *
   * **具備 `BACKEND:MODERATION:VIEW` 者可查詢任何成員**，不要求該成員與檢舉相關。
   * 要求「必須先有檢舉」會讓「查一個剛被停權的人」這種正當操作失敗，
   * 而它擋不住真正想濫用的人——他可以先從任何一筆檢舉取得 id。
   */
  @Get('members/:memberId')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  getMemberProfile(
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<MemberProfile> {
    return this.moderationFacade.getMemberProfile(memberId);
  }

  @Get('members/:memberId/reports')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  listMemberReports(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query(new ZodValidationPipe(memberReportsQuerySchema))
    query: MemberReportsQuery,
  ): Promise<ListMemberReportsResult> {
    return this.moderationFacade.listMemberReports({ memberId, ...query });
  }

  @Get('members/:memberId/rooms')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  listMemberRooms(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query(new ZodValidationPipe(timelineQuerySchema)) query: TimelineQuery,
  ): Promise<ListMemberRoomsResult> {
    return this.moderationFacade.listMemberRooms({ memberId, ...query });
  }

  @Get('members/:memberId/timeline')
  @Permissions(PermissionCode.BACKEND_MODERATION_VIEW)
  getMemberTimeline(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query(new ZodValidationPipe(timelineQuerySchema)) query: TimelineQuery,
  ): Promise<GetMemberTimelineResult> {
    return this.moderationFacade.getMemberTimeline({ memberId, ...query });
  }
}
