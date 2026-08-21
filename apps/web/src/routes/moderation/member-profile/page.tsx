import { useState, type ReactNode } from 'react';
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ArrowLeft, Circle } from 'lucide-react';

import type { paths } from '@app/api-client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/api/client';
import { cn } from '@/lib/utils';
import { useHasPermission } from '@/lib/use-has-permission';
import { MemberReportsPanel } from '../components/MemberReportsPanel';
import { MemberRoomsPanel } from '../components/MemberRoomsPanel';
import { MemberTimeline } from '../components/MemberTimeline';
import {
  useMemberProfileQuery,
  useMemberReportsQuery,
} from '../hooks/use-member-profile-query';
import {
  onlineLabel,
  parseReportRole,
  type MemberReportRole,
} from '../lib/moderation-display';

const PERM_VIEW = 'BACKEND:MODERATION:VIEW';

type RoomsData = NonNullable<
  paths['/moderation/members/{memberId}/rooms']['get']['responses'][200]['content']['application/json']['data']
>;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-sm">{children}</span>
  </div>
);

/** 統計數字；兩個方向刻意並列而非合成一個總數——它們的意義相反 */
const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-2xl font-semibold">{value}</span>
  </div>
);

export const MemberProfilePage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const { memberId = '' } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [timelinePage, setTimelinePage] = useState(1);
  const [reportPage, setReportPage] = useState(1);
  const [roomPage, setRoomPage] = useState(1);

  const enabled = canView && Boolean(memberId);
  const profileQuery = useMemberProfileQuery(enabled ? memberId : '');
  const reportsQuery = useMemberReportsQuery(
    enabled ? memberId : '',
    parseReportRole(searchParams.get('role')),
    reportPage,
  );
  const roomsQuery = useApiQuery(
    'GET',
    '/moderation/members/{memberId}/rooms',
    { params: { path: { memberId }, query: { page: roomPage } } },
    { enabled },
  );

  if (!canView) return <Navigate to="/" replace />;

  const role = parseReportRole(searchParams.get('role'));
  const setRole = (next: MemberReportRole) => {
    const params = new URLSearchParams(searchParams);
    params.set('role', next);
    setSearchParams(params, { replace: true });
    setReportPage(1);
  };

  const profile = profileQuery.data;
  const rooms: RoomsData['list'] = roomsQuery.data?.list ?? [];
  const roomsTotalPages = roomsQuery.data?.meta?.totalPages ?? 1;

  // 不寫死回佇列：使用者多半是從某一筆檢舉詳情過來的，跳回佇列會弄丟他的位置
  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => void navigate(-1)}>
      <ArrowLeft />
      返回
    </Button>
  );

  if (profileQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <p className="text-muted-foreground">成員不存在，或已被刪除。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        {backButton}
        <h1 className="text-2xl font-semibold">{profile.email}</h1>
        {/* 停權要明顯，不只是一行「停用」文字 */}
        {profile.status ? null : (
          <span className="bg-destructive text-destructive-foreground inline-flex h-6 items-center rounded-full px-3 text-xs font-medium">
            已停權
          </span>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>基本資料</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">{profile.email}</Field>
              <Field label="帳號狀態">
                {profile.status ? '啟用中' : '已停權'}
              </Field>
              <Field label="加入時間">{profile.joinedAt}</Field>
              <Field label="連線狀態">
                <span className="flex items-center gap-1">
                  <Circle
                    className={cn(
                      'size-2',
                      profile.isOnline
                        ? 'fill-emerald-500 text-emerald-500'
                        : 'fill-muted-foreground text-muted-foreground',
                    )}
                  />
                  {onlineLabel(profile.isOnline)}
                </span>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>檢舉統計</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-8">
              <Stat label="被檢舉" value={profile.reportedCount} />
              <Stat label="提出檢舉" value={profile.submittedReportCount} />
              <Stat label="所在聊天室" value={profile.roomCount} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>相關檢舉</CardTitle>
            </CardHeader>
            <CardContent>
              <MemberReportsPanel
                rows={reportsQuery.data?.list ?? []}
                isLoading={reportsQuery.isLoading}
                role={role}
                page={reportPage}
                totalPages={reportsQuery.data?.meta?.totalPages ?? 1}
                onRoleChange={setRole}
                onPageChange={setReportPage}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>所在聊天室</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <MemberRoomsPanel
                rooms={rooms}
                isLoading={roomsQuery.isLoading}
              />
              {roomsTotalPages > 1 ? (
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>
                    第 {roomPage} / {roomsTotalPages} 頁
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={roomPage <= 1}
                      onClick={() => setRoomPage(roomPage - 1)}
                    >
                      上一頁
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={roomPage >= roomsTotalPages}
                      onClick={() => setRoomPage(roomPage + 1)}
                    >
                      下一頁
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>行為紀錄</CardTitle>
          </CardHeader>
          <CardContent>
            <MemberTimeline
              memberId={memberId}
              page={timelinePage}
              onPageChange={setTimelinePage}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
