import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useApiQuery } from '@/api/client';
import { useDetailDialog } from '@/lib/use-detail-dialog';
import { useIpBlacklistQuery } from './hooks/use-ip-blacklist-query';
import { useIpBlacklistUrlState } from './hooks/use-ip-blacklist-url-state';
import { useIpBlacklistMutations } from './hooks/use-ip-blacklist-mutations';
import { IpBlacklistSearchBar } from './components/IpBlacklistSearchBar';
import {
  IpBlacklistTable,
  type IpBlacklistRow,
} from './components/IpBlacklistTable';
import { IpBlacklistFormDialog } from './components/IpBlacklistFormDialog';
import { IpBlacklistViewDialog } from './components/IpBlacklistViewDialog';
import type { IpBlacklistForm } from './lib/ip-blacklist-form-schema';

const mapDetailToForm = (data: {
  ipAddress?: string;
  reason?: string | null;
}): Partial<IpBlacklistForm> => ({
  ip: data.ipAddress ?? '',
  reason: data.reason ?? '',
});

export const IpBlacklistPage = () => {
  const url = useIpBlacklistUrlState();
  const { closeEdit, closeView, openEdit, openView } = url;
  const listQuery = useIpBlacklistQuery({
    page: url.page,
    limit: url.limit,
    search: url.search,
  });
  const mutations = useIpBlacklistMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IpBlacklistRow | null>(null);

  const detailId = url.edit ?? url.view ?? '';
  const detailQuery = useApiQuery(
    'GET',
    '/security/ip-blacklist/{id}',
    { params: { path: { id: detailId } } },
    { enabled: Boolean(url.edit) || Boolean(url.view) },
  );
  const detail = useDetailDialog({
    editId: url.edit,
    viewId: url.view,
    closeEdit,
    closeView,
    query: detailQuery,
    mapToInitial: mapDetailToForm,
    errorMessage: '找不到該紀錄或無權限存取',
  });

  const handleView = useCallback(
    (row: IpBlacklistRow) => {
      if (row.id) openView(row.id);
    },
    [openView],
  );
  const handleEdit = useCallback(
    (row: IpBlacklistRow) => {
      if (row.id) openEdit(row.id);
    },
    [openEdit],
  );
  const handleDeleteRequest = useCallback((row: IpBlacklistRow) => {
    setDeleteTarget(row);
  }, []);

  const list: IpBlacklistRow[] = listQuery.data?.list ?? [];
  const meta = listQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  };

  const handleCreateSubmit = async (values: IpBlacklistForm) => {
    await mutations.create.mutateAsync({
      body: { ip: values.ip, reason: values.reason || undefined },
    });
    setCreateOpen(false);
  };

  const handleUpdateSubmit = async (values: IpBlacklistForm) => {
    if (!url.edit) return;
    await mutations.update.mutateAsync({
      params: { path: { id: url.edit } },
      body: { reason: values.reason || undefined },
    });
    closeEdit();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await mutations.remove.mutateAsync({
        params: { path: { id: deleteTarget.id } },
      });
      setDeleteTarget(null);
    } catch {
      // mutation hook 已 toast.error
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="IP 黑名單"
        description="封鎖嘗試攻擊系統的 IP（系統自動封鎖會標示為「自動」來源）"
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          新增黑名單
        </Button>
      </PageHeader>

      <IpBlacklistSearchBar
        initialSearch={url.search}
        onSearch={url.setSearch}
      />

      <IpBlacklistTable
        data={list}
        isLoading={listQuery.isLoading}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
      />

      <DataTablePagination
        page={meta.page ?? url.page}
        limit={meta.limit ?? url.limit}
        total={meta.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />

      <IpBlacklistFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={mutations.create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <IpBlacklistFormDialog
        open={detail.editEnabled && !detail.isLoading && !!detail.initialValues}
        mode="edit"
        initialValues={detail.initialValues}
        isSubmitting={mutations.update.isPending}
        onClose={closeEdit}
        onSubmit={handleUpdateSubmit}
      />

      <IpBlacklistViewDialog
        open={detail.viewEnabled && !detail.isLoading && !!detail.initialValues}
        values={detail.initialValues}
        onClose={closeView}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="確認刪除黑名單"
        description={
          <>
            即將刪除
            <span className="text-foreground font-mono">
              {' '}
              {deleteTarget?.ipAddress ?? '—'}{' '}
            </span>
            。此操作無法復原；確認繼續嗎？
          </>
        }
        isDeleting={mutations.remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
