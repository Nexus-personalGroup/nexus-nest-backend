import { useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/PageHeader';
import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { useListUrlState } from '@/lib/use-list-url-state';
import { useHasPermission } from '@/lib/use-has-permission';
import { RoomsTable } from '../components/RoomsTable';
import { RoomTypeFilter } from '../components/RoomTypeFilter';
import {
  useRoomsQuery,
  type AdminRoomRow,
} from '../hooks/use-rooms-query';
import { parseRoomTypeFilter, type RoomType } from '../lib/moderation-display';

const PERM_VIEW = 'BACKEND:MODERATION:VIEW';

export const RoomsPage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const url = useListUrlState<never>({
    searchKeys: [],
    extraKeys: ['roomType'],
  });

  const roomType = parseRoomTypeFilter(searchParams.get('roomType'));
  const roomsQuery = useRoomsQuery({
    page: url.page,
    limit: url.limit,
    roomType,
  });

  const { setExtra } = url;
  const setRoomType = useCallback(
    (next: RoomType | undefined) => setExtra('roomType', next),
    [setExtra],
  );
  const handleView = useCallback(
    (room: AdminRoomRow) => {
      void navigate(`/moderation/rooms/${room.roomId}`);
    },
    [navigate],
  );

  if (!canView) return <Navigate to="/" replace />;

  const list = roomsQuery.data?.list ?? [];
  const meta = roomsQuery.data?.meta;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="聊天室" description="檢視聊天室的成員與活動概況">
        <RoomTypeFilter value={roomType} onChange={setRoomType} />
      </PageHeader>

      <RoomsTable
        data={list}
        isLoading={roomsQuery.isLoading}
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
