import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useHasPermission } from '@/lib/use-has-permission';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { FrontUserActions } from '../components/FrontUserActions';
import { ModerationLinkCard } from '../components/ModerationLinkCard';
import { useFrontUserDetailQuery } from '../hooks/use-front-users-query';
import { useFrontUserMutations } from '../hooks/use-front-user-mutations';
import {
  LAST_SEEN_HINT,
  avatarFallback,
  verifiedLabel,
} from '../lib/front-user-display';

const PERM_VIEW = 'BACKEND:FRONT_USER:VIEW';
const PERM_EDIT = 'BACKEND:FRONT_USER:EDIT';
const PERM_MODERATION_VIEW = 'BACKEND:MODERATION:VIEW';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-sm">{children}</span>
  </div>
);

/**
 * 前台會員詳情——回答的是「這個**帳號**是什麼狀態」。
 *
 * **本頁不顯示任何聊天內容或檢舉統計**：那些屬於審閱側的成員概覽，
 * 需要的是另一個權限。合併兩者會讓「這一區要哪個權限才看得到」
 * 變成頁面內部的隱藏規則，而權限差異在畫面上看不出來正是最容易出錯的地方。
 * 同時具備審閱權限的人會看到一個連過去的連結。
 */
export const FrontUserDetailPage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const canEdit = useHasPermission(PERM_EDIT);
  const canViewModeration = useHasPermission(PERM_MODERATION_VIEW);
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const detailQuery = useFrontUserDetailQuery(canView ? userId : '');
  const { suspend, reinstate, forceLogout } = useFrontUserMutations();

  if (!canView) return <Navigate to="/" replace />;

  const user = detailQuery.data;
  const isPending =
    suspend.isPending || reinstate.isPending || forceLogout.isPending;
  const params = { params: { path: { userId } } };

  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => void navigate(-1)}>
      <ArrowLeft />
      返回
    </Button>
  );

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <p className="text-muted-foreground">找不到這個使用者，或已被刪除。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        {backButton}
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium">
          {avatarFallback(user.displayName)}
        </span>
        <h1 className="text-2xl font-semibold">{user.displayName}</h1>
        {user.status ? null : (
          <span className="bg-destructive text-destructive-foreground inline-flex h-6 items-center rounded-full px-3 text-xs font-medium">
            已停權
          </span>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>帳號資料</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">{user.email}</Field>
              <Field label="帳號狀態">
                {user.status ? '啟用中' : '已停權'}
              </Field>
              <Field label="信箱驗證">
                {verifiedLabel(user.emailVerifiedAt)}
                {user.emailVerifiedAt ? (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {formatRelativeTime(user.emailVerifiedAt)}
                  </span>
                ) : null}
              </Field>
              <Field label="註冊時間">
                {formatRelativeTime(user.createdAt)}
              </Field>
              <Field label="最後登入">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      {formatRelativeTime(user.lastSeenAt, '從未登入')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{LAST_SEEN_HINT}</TooltipContent>
                </Tooltip>
              </Field>
            </CardContent>
          </Card>

          <ModerationLinkCard
            userId={user.id}
            canViewModeration={canViewModeration}
          />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>處置</CardTitle>
          </CardHeader>
          <CardContent>
            <FrontUserActions
              status={user.status}
              canEdit={canEdit}
              isPending={isPending}
              onSuspend={() => suspend.mutate(params)}
              onReinstate={() => reinstate.mutate(params)}
              onForceLogout={() => forceLogout.mutate(params)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
