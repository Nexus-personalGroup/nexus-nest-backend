import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { paths } from '@app/api-client';

import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { useApiQuery } from '@/api/client';
import { useHasPermission } from '@/lib/use-has-permission';
import { useCurrentMember } from '@/lib/use-current-member';
import { useDetailDialog } from '@/lib/use-detail-dialog';
import { useRolesQuery } from './hooks/use-roles-query';
import { useRolesUrlState } from './hooks/use-roles-url-state';
import { useRoleMutations } from './hooks/use-role-mutations';
import { RolesSearchBar } from './components/RolesSearchBar';
import { RolesTable, type RoleRow } from './components/RolesTable';
import { RoleFormDialog } from './components/RoleFormDialog';
import { RoleViewDialog } from './components/RoleViewDialog';
import { DeleteRoleDialog } from './components/DeleteRoleDialog';
import {
  normalizePermissionCodes,
  type RoleFormValues,
} from './lib/role-form-schema';

const PERM_VIEW = 'BACKEND:ROLE:VIEW';
const PERM_EDIT = 'BACKEND:ROLE:EDIT';

// 從 generated schema 推出 GET /roles 的 data 形狀，optimistic update 不走 escape hatch
type RolesData = NonNullable<
  paths['/roles']['get']['responses'][200]['content']['application/json']['data']
>;

// 由 raw detail data → dialog 初值的純函式；放外面避免 useCallback dep
const mapDetailToForm = (data: {
  name?: string;
  permissionCodes?: string[];
  status?: boolean;
}): RoleFormValues => ({
  name: data.name ?? '',
  permissionCodes: data.permissionCodes ?? [],
  status: data.status ?? true,
});

export const RolesPage = () => {
  // hook 先 unconditional 呼叫，再做條件 return（守 react-hooks/rules-of-hooks）
  const canView = useHasPermission(PERM_VIEW);
  const canEdit = useHasPermission(PERM_EDIT);
  const { isLoading: meLoading } = useCurrentMember();
  const queryClient = useQueryClient();

  const url = useRolesUrlState();
  const { openEdit, closeEdit, openView, closeView } = url;
  const rolesQuery = useRolesQuery({
    page: url.page,
    limit: url.limit,
    name: url.name,
    status: url.status,
  });
  const mutations = useRoleMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);

  // edit / view 共用同一支 GET endpoint；用 enabled 控制誰實際發 request
  const detailId = url.edit ?? url.view ?? '';
  const detailQuery = useApiQuery(
    'GET',
    '/roles/{id}',
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
    errorMessage: '找不到該角色或無權限存取',
  });

  const handleToggleStatus = useCallback(
    async (role: RoleRow, nextStatus: boolean) => {
      if (!role.id) return;
      // optimistic：把所有 GET /roles 變體中對應 row 的 status 翻轉
      queryClient.setQueriesData<RolesData>(
        { queryKey: ['GET', '/roles'] },
        (old) => mutateRowStatus(old, role.id!, nextStatus),
      );
      try {
        // 單一 PATCH 只送 status，不影響 name / permissions；
        // 與 form 編輯共用 update mutation（toast 文案統一為「角色已更新」）
        await mutations.update.mutateAsync({
          params: { path: { id: role.id } },
          body: { status: nextStatus },
        });
      } catch {
        // mutation hook 已 toast.error + invalidate；這裡 catch 只為了不讓 await 拋
      }
    },
    [mutations.update, queryClient],
  );

  const handleEdit = useCallback(
    (role: RoleRow) => {
      if (role.id) openEdit(role.id);
    },
    [openEdit],
  );

  const handleView = useCallback(
    (role: RoleRow) => {
      if (role.id) openView(role.id);
    },
    [openView],
  );

  const handleDeleteRequest = useCallback((role: RoleRow) => {
    setDeleteTarget(role);
  }, []);

  // 條件 return 放在所有 hook 之後
  if (!canView && !meLoading) {
    return <Navigate to="/" replace />;
  }

  const list: RoleRow[] = rolesQuery.data?.list ?? [];
  const meta = rolesQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  };

  const handleCreateSubmit = async (values: RoleFormValues) => {
    await mutations.create.mutateAsync({
      body: {
        name: values.name,
        // defense in depth：UI 已強制 EDIT→VIEW，提交前再 normalize 一次（sort + 去重 + 補 VIEW）
        permissionCodes: normalizePermissionCodes(values.permissionCodes),
      },
    });
    setCreateOpen(false);
  };

  const handleUpdateSubmit = async (values: RoleFormValues) => {
    if (!url.edit) return;
    await mutations.update.mutateAsync({
      params: { path: { id: url.edit } },
      body: {
        name: values.name,
        permissionCodes: normalizePermissionCodes(values.permissionCodes),
        status: values.status,
      },
    });
    closeEdit();
  };

  const handleConfirmDelete = async (role: RoleRow) => {
    if (!role.id) return;
    try {
      await mutations.remove.mutateAsync({
        params: { path: { id: role.id } },
      });
      setDeleteTarget(null);
    } catch {
      // mutation hook 已 toast.error；dialog 留著讓使用者看到狀態
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">角色管理</h1>
          <p className="text-muted-foreground text-sm">
            管理後台角色、權限指派與啟用狀態
          </p>
        </div>
        <Button disabled={!canEdit} onClick={() => setCreateOpen(true)}>
          <Plus />
          新增角色
        </Button>
      </header>

      <RolesSearchBar
        initialName={url.name}
        initialStatus={url.status}
        onSearch={url.setSearch}
        onStatusChange={url.setStatus}
      />

      <RolesTable
        data={list}
        isLoading={rolesQuery.isLoading}
        canEdit={canEdit}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onToggleStatus={handleToggleStatus}
      />

      <DataTablePagination
        page={meta.page ?? url.page}
        limit={meta.limit ?? url.limit}
        total={meta.total ?? 0}
        onPageChange={url.setPage}
        onLimitChange={url.setLimit}
      />

      <RoleFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={mutations.create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <RoleFormDialog
        open={detail.editEnabled && !detail.isLoading && !!detail.initialValues}
        mode="edit"
        initialValues={detail.initialValues}
        isSubmitting={mutations.update.isPending}
        onClose={closeEdit}
        onSubmit={handleUpdateSubmit}
      />

      <RoleViewDialog
        open={detail.viewEnabled && !detail.isLoading && !!detail.initialValues}
        values={detail.initialValues}
        onClose={closeView}
      />

      <DeleteRoleDialog
        role={deleteTarget}
        isDeleting={mutations.remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

const mutateRowStatus = (
  data: RolesData | undefined,
  id: string,
  nextStatus: boolean,
): RolesData | undefined => {
  if (!data?.list) return data;
  return {
    ...data,
    list: data.list.map((row) =>
      row.id === id ? { ...row, status: nextStatus } : row,
    ),
  };
};
