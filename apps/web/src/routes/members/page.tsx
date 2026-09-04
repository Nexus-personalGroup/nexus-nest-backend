import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { paths } from '@app/api-client';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/data-table/DataTablePagination';
import { useApiQuery } from '@/api/client';
import { useCurrentMember } from '@/lib/use-current-member';
import { useHasPermission } from '@/lib/use-has-permission';
import { useDetailDialog } from '@/lib/use-detail-dialog';
import { useMembersQuery } from './hooks/use-members-query';
import { useMembersUrlState } from './hooks/use-members-url-state';
import { useMemberMutations } from './hooks/use-member-mutations';
import { MembersSearchBar } from './components/MembersSearchBar';
import { MembersTable, type MemberRow } from './components/MembersTable';
import { MemberFormDialog } from './components/MemberFormDialog';
import { MemberViewDialog } from './components/MemberViewDialog';
import { DeleteMemberDialog } from './components/DeleteMemberDialog';
import type { CreateMemberForm } from './lib/member-form-schema';

const PERM_VIEW = 'BACKEND:ACCOUNT:VIEW';
const PERM_EDIT = 'BACKEND:ACCOUNT:EDIT';

// 從 generated schema 推出 GET /members 的 data 形狀，optimistic update 不再走 escape hatch
type MembersData = NonNullable<
  paths['/members']['get']['responses'][200]['content']['application/json']['data']
>;

// 由 raw detail data → dialog 初值的純函式；放外面避免 useCallback dep
const mapDetailToForm = (data: {
  email?: string;
  member?: string;
  roleId?: string;
  status?: boolean;
}): Partial<CreateMemberForm> => ({
  email: data.email ?? '',
  member: data.member ?? '',
  password: '',
  roleId: data.roleId ?? '',
  status: data.status ?? true,
});

export const MembersPage = () => {
  // 所有 hook 都先 unconditional 呼叫，再做條件 return（守 react-hooks/rules-of-hooks）
  const canView = useHasPermission(PERM_VIEW);
  const canEdit = useHasPermission(PERM_EDIT);
  const { sub, isLoading: meLoading } = useCurrentMember();
  const queryClient = useQueryClient();

  const url = useMembersUrlState();
  const { closeEdit, closeView, openEdit, openView } = url;
  const membersQuery = useMembersQuery({
    page: url.page,
    limit: url.limit,
    name: url.name,
    email: url.email,
    status: url.status,
  });
  const mutations = useMemberMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null);

  // edit / view 共用一支 GET，用 enabled 控制誰實際發 request
  const detailId = url.edit ?? url.view ?? '';
  const detailQuery = useApiQuery(
    'GET',
    '/members/{id}',
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
    errorMessage: '找不到該會員或無權限存取',
  });

  const handleToggleStatus = useCallback(
    async (member: MemberRow, nextStatus: boolean) => {
      if (!member.id) return;
      // optimistic：把所有 GET /members 變體中對應 row 的 status 翻轉
      queryClient.setQueriesData<MembersData>(
        { queryKey: ['GET', '/members'] },
        (old) => mutateRowStatus(old, member.id!, nextStatus),
      );
      try {
        // 真 partial PATCH：只送翻轉的欄位，避免覆蓋其他併發寫入
        await mutations.update.mutateAsync({
          params: { path: { id: member.id } },
          body: { status: nextStatus },
        });
      } catch {
        // mutation hook 自己已 toast.error；invalidate 重抓回正確狀態
        void queryClient.invalidateQueries({ queryKey: ['GET', '/members'] });
      }
    },
    [mutations.update, queryClient],
  );

  const handleEdit = useCallback(
    (member: MemberRow) => {
      if (member.id) openEdit(member.id);
    },
    [openEdit],
  );

  const handleView = useCallback(
    (member: MemberRow) => {
      if (member.id) openView(member.id);
    },
    [openView],
  );

  const handleDeleteRequest = useCallback((member: MemberRow) => {
    setDeleteTarget(member);
  }, []);

  // 條件 return 放在所有 hook 之後
  if (!canView && !meLoading) {
    return <Navigate to="/" replace />;
  }

  const list: MemberRow[] = membersQuery.data?.list ?? [];
  const meta = membersQuery.data?.meta ?? {
    page: url.page,
    limit: url.limit,
    total: 0,
    totalPages: 1,
  };

  const handleCreateSubmit = async (values: CreateMemberForm) => {
    await mutations.create.mutateAsync({ body: values });
    setCreateOpen(false);
  };

  const handleUpdateSubmit = async (values: CreateMemberForm) => {
    if (!url.edit) return;
    // 編輯時 password 為空字串 → 不送，避免後端把空字串當新密碼存
    const body: Partial<CreateMemberForm> = { ...values };
    if (!body.password) delete body.password;
    await mutations.update.mutateAsync({
      params: { path: { id: url.edit } },
      body: body as CreateMemberForm,
    });
    closeEdit();
  };

  const handleConfirmDelete = async (member: MemberRow) => {
    if (!member.id) return;
    try {
      await mutations.remove.mutateAsync({
        params: { path: { id: member.id } },
      });
      setDeleteTarget(null);
    } catch {
      // mutation hook 已 toast.error；dialog 留著讓使用者看到狀態
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="管理者帳號"
        description="後台管理員的帳號、角色指派與啟用狀態。聊天服務的使用者在「會員列表」"
      >
        <Button disabled={!canEdit} onClick={() => setCreateOpen(true)}>
          <Plus />
          新增會員
        </Button>
      </PageHeader>

      <MembersSearchBar
        initialName={url.name}
        initialEmail={url.email}
        initialStatus={url.status}
        onSearch={url.setSearch}
        onStatusChange={url.setStatus}
      />

      <MembersTable
        data={list}
        isLoading={membersQuery.isLoading}
        currentSub={sub}
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

      <MemberFormDialog
        open={createOpen}
        mode="create"
        isSubmitting={mutations.create.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <MemberFormDialog
        open={detail.editEnabled && !detail.isLoading && !!detail.initialValues}
        mode="edit"
        initialValues={detail.initialValues}
        isSubmitting={mutations.update.isPending}
        onClose={closeEdit}
        onSubmit={handleUpdateSubmit}
      />

      <MemberViewDialog
        open={detail.viewEnabled && !detail.isLoading && !!detail.initialValues}
        values={detail.initialValues}
        onClose={closeView}
      />

      <DeleteMemberDialog
        member={deleteTarget}
        isDeleting={mutations.remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

const mutateRowStatus = (
  data: MembersData | undefined,
  id: string,
  nextStatus: boolean,
): MembersData | undefined => {
  if (!data?.list) return data;
  return {
    ...data,
    list: data.list.map((row) =>
      row.id === id ? { ...row, status: nextStatus } : row,
    ),
  };
};
