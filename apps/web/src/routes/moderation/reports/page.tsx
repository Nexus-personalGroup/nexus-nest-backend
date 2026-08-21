import { useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { useHasPermission } from '@/lib/use-has-permission';
import { ReportsTable } from '../components/ReportsTable';
import { ReportStatusFilter } from '../components/ReportStatusFilter';
import { useReportsQuery, type ReportRow } from '../hooks/use-reports-query';
import { useReportsUrlState } from '../hooks/use-reports-url-state';

const PERM_VIEW = 'BACKEND:MODERATION:VIEW';

export const ReportsPage = () => {
  // hook 一律 unconditional 先呼叫，再做條件 return（守 react-hooks/rules-of-hooks）
  const canView = useHasPermission(PERM_VIEW);
  const navigate = useNavigate();
  const url = useReportsUrlState();
  const reportsQuery = useReportsQuery({
    page: url.page,
    limit: url.limit,
    status: url.status,
  });

  const handleView = useCallback(
    (report: ReportRow) => {
      void navigate(`/moderation/reports/${report.reportId}`);
    },
    [navigate],
  );

  if (!canView) return <Navigate to="/" replace />;

  const list = reportsQuery.data?.list ?? [];
  const meta = reportsQuery.data?.meta;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">檢舉審閱</h1>
          <p className="text-muted-foreground text-sm">
            處理使用者提出的訊息檢舉
          </p>
        </div>
        <ReportStatusFilter value={url.status} onChange={url.setStatus} />
      </header>

      <ReportsTable
        data={list}
        isLoading={reportsQuery.isLoading}
        onView={handleView}
      />

      <DataTablePagination
        page={meta?.page ?? url.page}
        limit={meta?.limit ?? url.limit}
        total={meta?.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />
    </div>
  );
};
