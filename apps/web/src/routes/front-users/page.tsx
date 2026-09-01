import { useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { useListUrlState } from '@/lib/use-list-url-state';
import { useHasPermission } from '@/lib/use-has-permission';
import {
  parseStatusParam,
  statusFilterToBoolean,
  type StatusFilter,
} from '@/lib/status-filter';
import { FrontUsersSearchBar } from './components/FrontUsersSearchBar';
import { FrontUsersTable } from './components/FrontUsersTable';
import {
  useFrontUsersQuery,
  type FrontUserRow,
} from './hooks/use-front-users-query';

const PERM_VIEW = 'BACKEND:FRONT_USER:VIEW';

type SearchKey = 'email' | 'displayName';

/**
 * 會員列表（前台使用者）。
 *
 * 與 `/members`（管理者帳號）是**兩個不同的帳號體系**：
 * 這裡是聊天的使用者（`users`），那裡是後台管理員（`members`）。
 * 兩者在 Sidebar 分屬不同群組——區別由分組承擔，不靠標籤前綴。
 *
 * 這一頁存在的理由是讓後台不必再「從檢舉點進去」才找得到一個人。
 */
export const FrontUsersPage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const url = useListUrlState<SearchKey>({
    searchKeys: ['email', 'displayName'],
    extraKeys: ['status', 'verified'],
  });

  const status = parseStatusParam(searchParams.get('status'));
  const verified = parseStatusParam(searchParams.get('verified'));

  const usersQuery = useFrontUsersQuery({
    page: url.page,
    limit: url.limit,
    email: url.searches.email || undefined,
    displayName: url.searches.displayName || undefined,
    status: statusFilterToBoolean(status),
    verified: statusFilterToBoolean(verified),
  });

  const { setSearches, setExtra } = url;
  const handleSearch = useCallback(
    (email: string, displayName: string) => setSearches({ email, displayName }),
    [setSearches],
  );
  const handleStatus = useCallback(
    (next: StatusFilter) => setExtra('status', next),
    [setExtra],
  );
  const handleVerified = useCallback(
    (next: StatusFilter) => setExtra('verified', next),
    [setExtra],
  );
  const handleView = useCallback(
    (user: FrontUserRow) => {
      void navigate(`/front-users/${user.id}`);
    },
    [navigate],
  );

  if (!canView) return <Navigate to="/" replace />;

  const list = usersQuery.data?.list ?? [];
  const meta = usersQuery.data?.meta;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">會員列表</h1>
        <p className="text-muted-foreground text-sm">
          聊天服務的使用者。後台管理員的帳號在「管理者帳號」，兩者是獨立的體系
        </p>
      </header>

      <FrontUsersSearchBar
        initialEmail={url.searches.email}
        initialDisplayName={url.searches.displayName}
        initialStatus={status}
        initialVerified={verified}
        onSearch={handleSearch}
        onStatusChange={handleStatus}
        onVerifiedChange={handleVerified}
      />

      <FrontUsersTable
        data={list}
        isLoading={usersQuery.isLoading}
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
