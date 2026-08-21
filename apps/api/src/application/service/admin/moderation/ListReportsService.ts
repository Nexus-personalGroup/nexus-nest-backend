import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_REPORTS_USE_CASE,
  ListReportsQuery,
  ListReportsResult,
  ListReportsUseCase,
} from '@app/application/port/in/admin/moderation/ModerationUseCases';
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
    return { list: data, meta: buildPaginationMeta(page, limit, total) };
  }
}
