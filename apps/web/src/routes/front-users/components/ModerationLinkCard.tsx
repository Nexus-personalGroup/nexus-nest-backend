import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ModerationLinkCardProps = {
  userId: string;
  /** 是否有 BACKEND:MODERATION:VIEW */
  canViewModeration: boolean;
};

/**
 * 連往審閱側成員概覽的入口。
 *
 * **導覽與動作的權限規則相反，這是刻意的**：動作在沒有權限時停用並說明理由
 * （使用者需要知道「這件事做得到，只是不是由我做」），而導覽直接隱藏——
 * 點進去只會得到一個無權限畫面，留著它只是製造一次無效的往返。
 *
 * 抽成獨立元件是為了讓這條權限規則測得到：頁面層要測得起 router 與 query client，
 * 而這裡要驗的只有「有沒有那個權限」。
 */
export const ModerationLinkCard = ({
  userId,
  canViewModeration,
}: ModerationLinkCardProps) => {
  if (!canViewModeration) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>聊天行為</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-3 text-sm">
          檢舉統計、所在聊天室與行為時間軸屬於檢舉審閱的範圍，在另一頁。
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/moderation/members/${userId}`}>
            <ExternalLink />
            查看審閱紀錄
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
