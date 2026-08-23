import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_REPORTS_USE_CASE,
  ListReportsQuery,
  ListReportsResult,
  ListReportsUseCase,
  ReportListItemView,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '@app/application/port/out/user/LoadUserPort';
import type { ChatReportListItem } from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  CHAT_REPORT_REPOSITORY_PORT,
  ChatReportRepositoryPort,
} from '@app/application/port/out/chat-report/ChatReportRepositoryPort';
import {
  buildPaginationMeta,
  getPagination,
} from '@app/infrastructure/pagination';

export { LIST_REPORTS_USE_CASE };

@Injectable()
export class ListReportsService implements ListReportsUseCase {
  constructor(
    @Inject(CHAT_REPORT_REPOSITORY_PORT)
    private readonly reportRepo: ChatReportRepositoryPort,
    @Inject(LOAD_USER_PORT)
    private readonly userRepo: LoadUserPort,
  ) {}

  async execute(query: ListReportsQuery): Promise<ListReportsResult> {
    const { page, limit } = getPagination({
      page: query.page,
      limit: query.limit,
    });
    // 預設只看待處理：佇列的用途是「還有什麼要處理」，不是瀏覽歷史
    const { data, total } = await this.reportRepo.list({
      status: query.status ?? 'PENDING',
      page,
      limit,
    });

    // **本 service 刻意不寫稽核。** 列表不含內容快照，看不到任何敏感內容——
    // 記了會讓稽核量與「點了幾下」對齊，而不是與「實際看到了什麼」對齊
    return {
      list: await this.attachEmails(data),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  /**
   * 補上當事人的 email
   *
   * **一次批次查詢，不逐列查。** 一頁 15 筆最多 30 個 id，去重後一次查完；
   * 逐列查在測試資料上跑起來完全正常，只有計次抓得到。
   *
   * @param rows - 檢舉列表
   * @returns 補上 email 的列表；查不到的帳號為 null
   */
  private async attachEmails(
    rows: ChatReportListItem[],
  ): Promise<ReportListItemView[]> {
    const emails = await this.userRepo.findEmailsByIds([
      ...new Set(rows.flatMap((row) => [row.reporterId, row.targetMemberId])),
    ]);

    return rows.map((row) => ({
      ...row,
      reporterEmail: emails.get(row.reporterId) ?? null,
      targetMemberEmail: emails.get(row.targetMemberId) ?? null,
    }));
  }
}
