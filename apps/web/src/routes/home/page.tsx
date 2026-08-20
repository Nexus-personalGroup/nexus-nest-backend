import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiQuery } from '@/api/client';

export const HomePage = () => {
  // 示範：呼叫 /me 取登入者資料，型別會自動推導為 yaml 內的 data shape
  const meQuery = useApiQuery('GET', '/me');

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>歡迎回來</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            管理後台骨架已建立完成，後續會接上會員、角色、權限等模組。
          </p>
        </CardContent>
      </Card>

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
