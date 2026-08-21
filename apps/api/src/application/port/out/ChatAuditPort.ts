export const CHAT_AUDIT_PORT = 'CHAT_AUDIT_PORT';

/**
 * 稽核的動作類型。
 *
 * 聯集型別而非 string：typo 會產生一個沒有人發現的新類別，
 * 而查詢時只會少一筆——沒有錯誤、沒有徵兆。DB 端用 enum 再擋一次。
 */
export type ChatAuditAction =
  | 'ROOM_JOINED'
  | 'ROOM_LEFT'
  | 'MESSAGE_RETRACTED'
  | 'MESSAGE_RETRACT_REJECTED'
  | 'MESSAGE_RATE_LIMITED'
  | 'REPORT_SUBMITTED'
  | 'REPORT_VIEWED';

export interface ChatAuditEvent {
  /** 執行動作的成員 */
  memberId: string;
  action: ChatAuditAction;
  roomId?: string;
  /** 動作的對象成員——檢舉調查要看的是「B 對 A 做過什麼」 */
  targetMemberId?: string;
  targetMessageId?: string;
}

/**
 * 聊天行為稽核。
 *
 * **只記「證據會消失」的行為。** 送出訊息不記——`chat_messages` 已經記了
 * 發送者、房間、時間、序號，再寫一筆稽核只是把同一份中繼資料存兩次。
 * 真正沒有紀錄的是離開房間（成員關係列被直接刪除）、被限流擋下、撤回被拒。
 *
 * **不記訊息內容。** 內容已在 `chat_messages`（撤回也保留），
 * 複製一份等於多一條洩漏路徑，而且兩份的遮蔽規則必須同步維護。
 *
 * 實作是 **best-effort**：呼叫端必須接住錯誤——稽核表滿了不該讓使用者
 * 送不出訊息。有守則檢查每個呼叫點都有 catch。
 */
/** 行為時間軸的一列；不含訊息內容——稽核表本來就不存 */
export interface ChatAuditEntry {
  action: ChatAuditAction;
  roomId: string | null;
  targetMemberId: string | null;
  targetMessageId: string | null;
  createdAt: Date;
}

export interface ListAuditParams {
  memberId: string;
  page: number;
  limit: number;
}

export interface ListAuditPage {
  data: ChatAuditEntry[];
  total: number;
}

export interface ChatAuditPort {
  record(event: ChatAuditEvent): Promise<void>;

  /**
   * 某成員的行為時間軸。
   *
   * 以**成員**為主體而非泛用的「查全部稽核」：調查的問題永遠是
   * 「這個人做了什麼」，`(memberId, createdAt)` 索引就是為它建的。
   * 泛用查詢會誘使人做無調查價值的全表瀏覽。
   */
  listByMember(params: ListAuditParams): Promise<ListAuditPage>;
}
