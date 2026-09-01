import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiQuery } from '@/api/client';
import { useHasPermission } from '@/lib/use-has-permission';

const PERM_MODERATION_VIEW = 'BACKEND:MODERATION:VIEW';

/**
 * 快照的產生時間，顯示為絕對時間而非「N 分鐘前」。
 *
 * **首頁的數字不會自動更新**（用的是快照端點，不是總覽頁那條 SSE），
 * 所以相對時間會騙人：頁面開著不動，「剛剛」會一直是「剛剛」。
 *
 * **日期也要顯示**，不能只有時分——頁面開著過夜再回來看，
 * 只有「14:32」會被當成今天的。要盯即時數字請進完整營運總覽。
 */
const formatSnapshotTime = (iso: string | Date): string =>
  new Date(iso).toLocaleString('zh-Hant', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // 後台一律 24 小時制：`下午11:23` 在 zh-Hant 下不帶空格、讀起來黏在一起，
    // 而營運情境本來就不該讓人多做一次 AM/PM 的換算
    hour12: false,
  });

/**
 * 登入後的落點。
 *
 * **這裡的營運數字是一次性的快照，不會自動更新**——要盯即時數字請進
 * 完整營運總覽（那頁有 SSE 與中斷時的過期標示）。因此時間戳顯示的是
 * **絕對時間**：相對時間（「剛剛」）在頁面開著不動時會一直是「剛剛」。
 *
 * **內容一律依權限決定。** 首頁對所有已登入者開放，而營運數字需要
 * `BACKEND:MODERATION:VIEW`——不能假設看得到。沒有權限的區塊**整塊不渲染**，
 * 不顯示「無權限」或空數字：導覽與資訊揭露用隱藏，**看得到但點不進去比看不到更困惑**。
 * （動作類元件的規則相反——見 `ui-moderation`：無權限時 disabled 並說明理由，
 * 因為使用者需要知道「這件事做得到，只是不是由我做」。）
 *
 * **刻意不放功能入口的捷徑**：Sidebar 是常駐的、不會收起來，
 * 在首頁再列一次同樣的連結是純粹的重複。真的需要時再加，
 * 而屆時那份清單必須由 `NAV_ITEMS` 衍生——手寫第二份會漂移，
 * 而漂移的方向是首頁少了一個剛加的模組，沒有東西會失敗。
 */
export const HomePage = () => {
  const meQuery = useApiQuery('GET', '/me');
  const canSeeOps = useHasPermission(PERM_MODERATION_VIEW);

  const opsQuery = useApiQuery('GET', '/moderation/dashboard', undefined, {
    enabled: canSeeOps,
  });

  return (
    <div className="flex flex-col gap-4">
      {canSeeOps && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
              <span>營運概況</span>
              {opsQuery.data && (
                // 一組沒有時間戳的數字，在過期之後看起來與即時數字一模一樣
                <span className="text-muted-foreground text-xs font-normal">
                  資料時間 {formatSnapshotTime(opsQuery.data.generatedAt)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsQuery.isLoading && (
              <p className="text-muted-foreground text-sm">載入中…</p>
            )}
            {opsQuery.error && (
              <p className="text-destructive text-sm">
                讀取失敗：{opsQuery.error.message}
              </p>
            )}
            {opsQuery.data && (
              <div className="flex flex-wrap gap-6">
                <Stat label="線上會員" value={opsQuery.data.onlineMembers} />
                <Stat label="待處理檢舉" value={opsQuery.data.pendingReports} />
                <Stat label="今日訊息" value={opsQuery.data.messagesToday} />
                <Link
                  to="/moderation/dashboard"
                  className="text-primary self-end text-sm underline-offset-4 hover:underline"
                >
                  完整營運總覽
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>個人資料</CardTitle>
        </CardHeader>
        <CardContent>
          {meQuery.isLoading && (
            <p className="text-muted-foreground text-sm">載入中…</p>
          )}
          {meQuery.error && (
            <p className="text-destructive text-sm">
              讀取失敗：{meQuery.error.message}
            </p>
          )}
          {meQuery.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">名稱</dt>
              <dd>{meQuery.data.member}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{meQuery.data.email}</dd>
              <dt className="text-muted-foreground">角色</dt>
              <dd>{meQuery.data.roleName}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div>
    <div className="text-2xl font-semibold tabular-nums">{value}</div>
    <div className="text-muted-foreground text-xs">{label}</div>
  </div>
);
