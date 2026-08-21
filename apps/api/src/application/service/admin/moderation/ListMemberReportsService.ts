import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MEMBER_REPORTS_USE_CASE,
  ListMemberReportsQuery,
  ListMemberReportsResult,
  ListMemberReportsUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '@app/application/port/out/member/LoadMemberPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_MEMBER_REPORTS_USE_CASE };

/**
 * 某成員相關的檢舉列表。
 *
 * 與檢舉佇列同樣**不寫稽核**：回應不含內容快照。
 * 對造 email 的補齊沿用同一套做法——一次批次查，不逐列查。
 */
@Injectable()
export class ListMemberReportsService implements ListMemberReportsUseCase {
  constructor(
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
    @Inject(LOAD_MEMBER_PORT)
    private readonly memberRepo: LoadMemberPort,
  ) {}

  async execute(
    query: ListMemberReportsQuery,
  ): Promise<ListMemberReportsResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    // 預設看「被檢舉」：那是審閱的主要問題
    const { data, total } = await this.reportRepo.listByMember({
      memberId: query.memberId,
      role: query.role ?? 'TARGET',
      page,
      limit,
    });

    const emails = await this.memberRepo.findEmailsByIds([
      ...new Set(data.map((row) => row.counterpartId)),
    ]);

    return {
      list: data.map((row) => ({
        ...row,
        counterpartEmail: emails.get(row.counterpartId) ?? null,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }
}
