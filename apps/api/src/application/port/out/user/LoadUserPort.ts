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

/** 後台顯示用的前台使用者視圖。**沒有 `password`**——那是認證流程專屬的欄位 */
export interface UserSummaryDto {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: boolean;
  emailVerifiedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}

/**
 * 詳情與列表回**同一組欄位**。
 *
 * 原本多帶一個 `updatedAt`，拿掉了：這個 change 不提供任何編輯前台使用者的功能，
 * 而系統內唯一會動到 `updated_at` 的是登入時的 `lastSeenAt`——
 * 兩者幾乎永遠相同，多一欄只是多一個會被誤讀的數字。
 */
export type UserDetailDto = UserSummaryDto;

export interface ListUsersParams {
  page: number;
  limit: number;
  email?: string;
  displayName?: string;
  /** 啟用狀態過濾；undefined 表示不過濾 */
  status?: boolean;
  /** 信箱驗證狀態過濾；true 對應 `emailVerifiedAt != null`，undefined 表示不過濾 */
  verified?: boolean;
}

export interface ListUsersPage {
  data: UserSummaryDto[];
  total: number;
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
  /**
   * 該信箱是否已註冊。
   *
   * 呼叫端傳入的 email MUST 已正規化（小寫、去空白），
   * 否則 `Foo@x.com` 會被判定為「沒註冊過」然後撞上 unique 約束。
   */
  existsByEmail(email: string): Promise<boolean>;
  /**
   * 後台的分頁列表。多個條件同時給定時取交集，未給定的條件不過濾。
   *
   * 排序固定 `createdAt DESC`，不接受排序參數：可排序的欄位一旦開放
   * 就要為每一個建索引，而目前沒有任何排序需求。
   */
  listUsers(params: ListUsersParams): Promise<ListUsersPage>;
  /**
   * 後台的單筆詳情。
   *
   * **與 `loadById` 是兩支，不可共用**：後者帶 `password`（認證流程需要），
   * 而顯示路徑不該有機會把它送出去。分成兩支之後，「不小心回傳密碼雜湊」
   * 需要有人主動改 select，而不是忘記刪一個欄位。
   */
  loadDetailById(id: string): Promise<UserDetailDto | null>;
}
