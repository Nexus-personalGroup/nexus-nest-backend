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
  /**
   * 批次取 id → email 的對照，供後台審閱顯示用。
   *
   * 形狀刻意與 `LoadMemberPort.findEmailsByIds` 一致：**查不到的 id 不會出現在
   * 對照中**（回傳缺鍵而非 null 值），呼叫端用 `Map.get()` 拿到 `undefined`
   * 比拿到一個值是 null 的鍵少一層判斷。
   *
   * 已軟刪除的帳號視為查不到；**被停權的帳號仍然回傳**——
   * 停權者依然是一個存在的人，審閱要看得到他是誰。
   */
  findEmailsByIds(ids: string[]): Promise<Map<string, string>>;
  /**
   * 回傳其中「存在且已啟用」的使用者 ID 子集。
   *
   * 回傳子集而非布林：呼叫端多半需要知道**是哪幾個**不合格才能給出有用的錯誤，
   * 而且一次查完避免 N 次往返。
   */
  findActiveUserIds(ids: string[]): Promise<string[]>;
  /** 未軟刪除的前台使用者總數 */
  countUsers(): Promise<number>;
}
