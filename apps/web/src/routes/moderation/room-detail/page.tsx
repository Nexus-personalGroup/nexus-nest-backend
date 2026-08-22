import { type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useHasPermission } from '@/lib/use-has-permission';
import { RoomMembersPanel } from '../components/RoomMembersPanel';
import { useRoomDetailQuery } from '../hooks/use-rooms-query';
import {
  MESSAGE_COUNT_HINT,
  roomLabel,
  roomTypeLabel,
} from '../lib/moderation-display';

const PERM_VIEW = 'BACKEND:MODERATION:VIEW';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-sm">{children}</span>
  </div>
);

/**
 * 聊天室詳情
 *
 * **頁面上沒有任何通往訊息的入口**，而那是刻意的：
 * 看得到房間訊息是實質擴權——從「有人檢舉才看得到那一句」
 * 變成「能瀏覽任何房間的對話」。要看內容只能經由檢舉。
 */
export const RoomDetailPage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const detailQuery = useRoomDetailQuery(canView ? roomId : '');

  if (!canView) return <Navigate to="/" replace />;

  const room = detailQuery.data;

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

  if (!room) {
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <p className="text-muted-foreground">聊天室不存在，或已被刪除。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        {backButton}
        <h1 className="text-2xl font-semibold">{roomLabel(room.name)}</h1>
        <span className="bg-muted text-muted-foreground inline-flex h-6 items-center rounded-full px-3 text-xs">
          {roomTypeLabel(room.roomType)}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>房間概況</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="類型">{roomTypeLabel(room.roomType)}</Field>
            <Field label="成員數">{room.memberCount}</Field>
            <Field label="建立時間">{room.createdAt}</Field>
            <Field label="訊息量">
              <span className="inline-flex items-center gap-1">
                {room.messageCount}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="text-muted-foreground size-3" />
                  </TooltipTrigger>
                  <TooltipContent>{MESSAGE_COUNT_HINT}</TooltipContent>
                </Tooltip>
              </span>
            </Field>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>成員</CardTitle>
          </CardHeader>
          <CardContent>
            <RoomMembersPanel members={room.members} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
