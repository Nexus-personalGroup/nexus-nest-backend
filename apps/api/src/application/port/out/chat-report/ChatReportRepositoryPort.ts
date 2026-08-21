export const CHAT_REPORT_REPOSITORY_PORT = 'CHAT_REPORT_REPOSITORY_PORT';

export type ChatReportReason =
  | 'HARASSMENT'
  | 'SPAM'
  | 'INAPPROPRIATE'
  | 'OTHER';

export type ChatReportStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED';

export interface CreateReportInput {
  reporterId: string;
  targetMessageId: string;
  targetMemberId: string;
  roomId: string;
  reason: ChatReportReason;
  description?: string;
  /** 被檢舉訊息的內容快照；取自未遮蔽的原始內容 */
  contentSnapshot: string;
}

export interface ChatReportSummary {
  reportId: string;
  status: ChatReportStatus;
  createdAt: Date;
}

/** 佇列列表用的視圖。**刻意不含 `contentSnapshot`** */
export interface ChatReportListItem {
  reportId: string;
  reporterId: string;
  targetMemberId: string;
  roomId: string;
  reason: ChatReportReason;
  status: ChatReportStatus;
  createdAt: Date;
}

/** 詳情視圖，含內容快照——讀它的路徑必須留稽核 */
export interface ChatReportDetail extends ChatReportListItem {
  targetMessageId: string;
  description: string | null;
  contentSnapshot: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

/**
 * 查詢方向。
 *
 * 「他被檢舉」與「他檢舉別人」是兩件不同的事，合併查詢會讓計數與判讀都失去意義：
 * 一個被檢舉 10 次的人和一個提出 10 次檢舉的人，在「檢舉相關 10 筆」底下看起來一樣。
 */
export type MemberReportRole = 'TARGET' | 'REPORTER';

/** 成員相關檢舉的視圖；`counterpartId` 是對造——查被檢舉時是檢舉人，反之亦然 */
export interface MemberReportListItem {
  reportId: string;
  counterpartId: string;
  roomId: string;
  reason: ChatReportReason;
  status: ChatReportStatus;
  createdAt: Date;
}

export interface ListMemberReportsParams {
  memberId: string;
  role: MemberReportRole;
  page: number;
  limit: number;
}

export interface ListMemberReportsPage {
  data: MemberReportListItem[];
  total: number;
}

export interface ListReportsParams {
  status: ChatReportStatus;
  page: number;
  limit: number;
}

export interface ListReportsPage {
  data: ChatReportListItem[];
  total: number;
}

export interface UpdateReportStatusInput {
  reportId: string;
  status: Exclude<ChatReportStatus, 'PENDING'>;
  reviewedBy: string;
  reviewNote?: string;
}

export interface ChatReportRepositoryPort {
  /**
   * 建立檢舉；同一人對同一則訊息已檢舉過時回傳既有那筆。
   *
   * 「回傳既有」的處理留在這一層：它是 Prisma 的 P2002，讓 service 認得
   * 資料庫錯誤碼等於把持久層細節漏進 application 層。
   *
   * 用「先查有沒有」實作會有空窗——使用者連點兩下送出鈕就會產生兩筆。
   */
  findOrCreate(input: CreateReportInput): Promise<ChatReportSummary>;

  /**
   * 佇列列表。
   *
   * **回傳的視圖不含 `contentSnapshot`**，而且是型別上就沒有——
   * 不是「呼叫端記得不要用」。列表不含內容有兩個作用：讓稽核量與
   * 「實際看到敏感內容的次數」對齊，也讓管理員瀏覽時不會無意間看到一整頁敏感內容。
   */
  list(params: ListReportsParams): Promise<ListReportsPage>;

  /** 單筆詳情，含內容快照；不存在時回 null */
  findDetail(reportId: string): Promise<ChatReportDetail | null>;

  /**
   * 更新狀態。
   *
   * @returns false 代表該筆檢舉不存在
   */
  updateStatus(input: UpdateReportStatusInput): Promise<boolean>;

  /**
   * 某成員在某個方向上的檢舉筆數。
   *
   * **用 count 而非取回清單算長度**：被檢舉 500 次的帳號會為了一個數字
   * 把 500 筆資料撈進記憶體。這種寫法在測試資料上完全正常，
   * 只會讓某些頁面偶爾比較慢——而那不會有人回報。
   */
  countByMember(memberId: string, role: MemberReportRole): Promise<number>;

  /**
   * 某成員相關的檢舉列表。
   *
   * 與 `list()` 同樣**在型別上就沒有 `contentSnapshot`**——概覽頁不寫稽核，
   * 因此它絕對不能看得到內容。
   */
  listByMember(params: ListMemberReportsParams): Promise<ListMemberReportsPage>;
}
