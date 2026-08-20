export interface AuthLogData {
  memberId?: string;
  email: string;
  action:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILURE'
    | 'LOGOUT'
    | 'PASSWORD_RESET'
    | 'REFRESH';
  ipAddress?: string;
  userAgent?: string;
  detail?: string;
}

export const SAVE_AUTH_LOG_PORT = 'SAVE_AUTH_LOG_PORT';

export interface SaveAuthLogPort {
  /**
   * 儲存登入相關日誌
   * @param data - 登入日誌資料
   */
  saveAuthLog(data: AuthLogData): Promise<void>;
}
