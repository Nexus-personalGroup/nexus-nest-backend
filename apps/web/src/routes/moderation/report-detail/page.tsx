import { useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHasPermission } from '@/lib/use-has-permission';
import { MemberTimeline } from '../components/MemberTimeline';
import { ReportActions } from '../components/ReportActions';
import { ReviewForm } from '../components/ReviewForm';
import { StatusBadge } from '../components/StatusBadge';
import { useModerationMutations } from '../hooks/use-moderation-mutations';
import { useReportDetailQuery } from '../hooks/use-report-detail-query';
import { participantLabel, reasonLabel } from '../lib/moderation-display';
import type { ReviewForm as ReviewFormValues } from '../lib/review-form-schema';

const PERM_VIEW = 'BACKEND:MODERATION:VIEW';
const PERM_EDIT = 'BACKEND:MODERATION:EDIT';
const QUEUE_PATH = '/moderation/reports';

/** 標題 + 內容的一列資訊 */
const Field = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-sm">{children}</span>
  </div>
);

export const ReportDetailPage = () => {
  const canView = useHasPermission(PERM_VIEW);
  const canEdit = useHasPermission(PERM_EDIT);
  const { reportId = '' } = useParams<{ reportId: string }>();
  const [timelinePage, setTimelinePage] = useState(1);

  const detailQuery = useReportDetailQuery(canView ? reportId : '');
  const mutations = useModerationMutations();

  if (!canView) return <Navigate to="/" replace />;

  const detail = detailQuery.data;

  const isPending =
    mutations.removeMessage.isPending ||
    mutations.restoreMessage.isPending ||
    mutations.suspendMember.isPending ||
    mutations.reinstateMember.isPending;

  const backLink = (
    <Button variant="ghost" size="sm" asChild>
      <Link to={QUEUE_PATH}>
        <ArrowLeft />
        返回佇列
      </Link>
    </Button>
  );

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // 查無此檢舉要說出來——空白畫面會讓人以為是系統壞了而不是網址錯了
  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <p className="text-muted-foreground">檢舉不存在，或已被清除。</p>
      </div>
    );
  }

  const handleReview = (values: ReviewFormValues) => {
    mutations.reviewReport.mutate({
      params: { path: { reportId } },
      body: {
        status: values.status,
        // 空字串不送：後端的欄位是選填，送空字串會把既有註記清成空白
        ...(values.reviewNote ? { reviewNote: values.reviewNote } : {}),
      },
    });
  };

  const messageParams = {
    params: { path: { messageId: detail.targetMessageId } },
  };
  const memberParams = {
    params: { path: { memberId: detail.targetMemberId } },
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {backLink}
          <h1 className="text-2xl font-semibold">檢舉詳情</h1>
          <StatusBadge status={detail.status} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>檢舉資訊</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="檢舉人">
                {participantLabel(detail.reporterEmail, detail.reporterId)}
              </Field>
              <Field label="被檢舉人">
                {participantLabel(
                  detail.targetMemberEmail,
                  detail.targetMemberId,
                )}
              </Field>
              <Field label="原因">{reasonLabel(detail.reason)}</Field>
              <Field label="檢舉時間">{detail.createdAt}</Field>
              <Field label="補充說明">{detail.description ?? '—'}</Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>被檢舉的訊息</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/*
                必須標示這是快照而非現況：訊息可能已被撤回或移除，
                不標示會讓管理員以為他看到的是現在的內容
              */}
              <p className="text-muted-foreground text-xs">
                以下是「檢舉當下」的內容快照，不是訊息的現況。
              </p>
              <blockquote className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                {detail.contentSnapshot}
              </blockquote>
              {detail.targetMessageRemovedAt ? (
                <p className="text-destructive text-xs">
                  此訊息已於 {detail.targetMessageRemovedAt} 被移除
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>處置</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ReportActions
                targetMessageRemovedAt={detail.targetMessageRemovedAt}
                canEdit={canEdit}
                isPending={isPending}
                onRemoveMessage={() =>
                  mutations.removeMessage.mutate(messageParams)
                }
                onRestoreMessage={() =>
                  mutations.restoreMessage.mutate({
                    params: messageParams.params,
                  })
                }
                onSuspendMember={() =>
                  mutations.suspendMember.mutate(memberParams)
                }
                onReinstateMember={() =>
                  mutations.reinstateMember.mutate(memberParams)
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>判定</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {detail.status === 'PENDING' ? null : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="判定時間">{detail.reviewedAt ?? '—'}</Field>
                  <Field label="處理註記">{detail.reviewNote ?? '—'}</Field>
                </div>
              )}
              <ReviewForm
                canEdit={canEdit}
                isSubmitting={mutations.reviewReport.isPending}
                defaultNote={detail.reviewNote ?? ''}
                onSubmit={handleReview}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>被檢舉人的行為紀錄</CardTitle>
          </CardHeader>
          <CardContent>
            <MemberTimeline
              memberId={detail.targetMemberId}
              page={timelinePage}
              onPageChange={setTimelinePage}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
