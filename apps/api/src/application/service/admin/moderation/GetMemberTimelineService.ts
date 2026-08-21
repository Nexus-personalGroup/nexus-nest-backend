import { Inject, Injectable } from '@nestjs/common';
import {
  GET_MEMBER_TIMELINE_USE_CASE,
  GetMemberTimelineQuery,
  GetMemberTimelineResult,
  GetMemberTimelineUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { GET_MEMBER_TIMELINE_USE_CASE };

@Injectable()
export class GetMemberTimelineService implements GetMemberTimelineUseCase {
  constructor(
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  async execute(
    query: GetMemberTimelineQuery,
  ): Promise<GetMemberTimelineResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    // 稽核紀錄不含訊息內容，因此查看時間軸不需要另外留稽核
    const { data, total } = await this.audit.listByMember({
      memberId: query.memberId,
      page,
      limit,
    });
    return { list: data, meta: buildPaginationMeta(page, limit, total) };
  }
}
