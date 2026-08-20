import { Navigate, useLocation } from 'react-router-dom';

import { tokenStorage } from '@/lib/storage';

type RequireAuthProps = {
  children: React.ReactNode;
};

// 受保護路由：未登入時導向 /login，並把當前路徑放到 state 以便登入後返回
export const RequireAuth = ({ children }: RequireAuthProps) => {
  const token = tokenStorage.get();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
