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
}
