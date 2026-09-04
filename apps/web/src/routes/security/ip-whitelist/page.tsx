import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useApiQuery } from '@/api/client';
import { useDetailDialog } from '@/lib/use-detail-dialog';
import { useIpWhitelistQuery } from './hooks/use-ip-whitelist-query';
import { useIpWhitelistUrlState } from './hooks/use-ip-whitelist-url-state';
import { useIpWhitelistMutations } from './hooks/use-ip-whitelist-mutations';
import { IpWhitelistSearchBar } from './components/IpWhitelistSearchBar';
import {
  IpWhitelistTable,
  type IpWhitelistRow,
} from './components/IpWhitelistTable';
import { IpWhitelistFormDialog } from './components/IpWhitelistFormDialog';
import { IpWhitelistViewDialog } from './components/IpWhitelistViewDialog';
import type { IpWhitelistForm } from './lib/ip-whitelist-form-schema';

const mapDetailToForm = (data: {
  ipAddress?: string;
  description?: string | null;
}): Partial<IpWhitelistForm> => ({
  ip: data.ipAddress ?? '',
  description: data.description ?? '',
});

export const IpWhitelistPage = () => {
  const url = useIpWhitelistUrlState();
  const { closeEdit, closeView, openEdit, openView } = url;
  const listQuery = useIpWhitelistQuery({
    page: url.page,
    limit: url.limit,
    search: url.search,
  });
  const mutations = useIpWhitelistMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IpWhitelistRow | null>(null);

  const detailId = url.edit ?? url.view ?? '';
  const detailQuery = useApiQuery(
    'GET',
    '/security/ip-whitelist/{id}',
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
    (row: IpWhitelistRow) => {
      if (row.id) openView(row.id);
    },
    [openView],
  );
  const handleEdit = useCallback(
    (row: IpWhitelistRow) => {
      if (row.id) openEdit(row.id);
    },
    [openEdit],
  );
  const handleDeleteRequest = useCallback((row: IpWhitelistRow) => {
    setDeleteTarget(row);
  }, []);

  const list: IpWhitelistRow[] = listQuery.data?.list ?? [];
  const meta = listQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  };

  const handleCreateSubmit = async (values: IpWhitelistForm) => {
    await mutations.create.mutateAsync({
      body: { ip: values.ip, description: values.description || undefined },
    });
    setCreateOpen(false);
  };

  const handleUpdateSubmit = async (values: IpWhitelistForm) => {
    if (!url.edit) return;
    await mutations.update.mutateAsync({
      params: { path: { id: url.edit } },
      body: { description: values.description || undefined },
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
      // mutation hook 已 toast.error；dialog 留著
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="IP 白名單"
        description="管理允許存取系統的 IP（適用於辦公網段、特定客戶端等）"
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          新增白名單
        </Button>
      </PageHeader>

      <IpWhitelistSearchBar
        initialSearch={url.search}
        onSearch={url.setSearch}
      />

      <IpWhitelistTable
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

      <IpWhitelistFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={mutations.create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <IpWhitelistFormDialog
        open={detail.editEnabled && !detail.isLoading && !!detail.initialValues}
        mode="edit"
        initialValues={detail.initialValues}
        isSubmitting={mutations.update.isPending}
        onClose={closeEdit}
        onSubmit={handleUpdateSubmit}
      />

      <IpWhitelistViewDialog
        open={detail.viewEnabled && !detail.isLoading && !!detail.initialValues}
        values={detail.initialValues}
        onClose={closeView}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="確認刪除白名單"
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
