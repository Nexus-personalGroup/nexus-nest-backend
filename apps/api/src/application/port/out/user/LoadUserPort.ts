export const LOAD_USER_PORT = 'LOAD_USER_PORT';

/** 前台使用者的完整資料（含 password hash），僅供認證流程使用 */
export interface UserRecordDto {
  id: string;
  email: string;
  password: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  status: boolean;
  tokenVersion: number;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface LoadUserPort {
  /** 依 email 查詢，含 password hash——登入用 */
  loadByEmail(email: string): Promise<UserRecordDto | null>;
  /** 依 ID 查詢，含 password hash——refresh 與解析 token 用 */
  loadById(id: string): Promise<UserRecordDto | null>;
  /**
   * 記錄這次活動的時間。
   *
   * **失敗不得影響主流程**：它是統計用途，讓登入因為寫不進一個時間戳而失敗
   * 是把次要的東西擺在主要的東西前面。
   */
  touchLastSeen(id: string): Promise<void>;
}
