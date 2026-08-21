export const CHAT_MESSAGE_REPOSITORY_PORT = 'CHAT_MESSAGE_REPOSITORY_PORT';

export interface ChatMessage {
  messageId: string;
  roomId: string;
  senderId: string;
  /** 已撤回時為空字串——遮蔽發生在 repository 的投影函式，呼叫端拿不到原內容 */
  content: string;
  seq: number;
  /** 撤回時間；null 代表未撤回 */
  retractedAt: Date | null;
  createdAt: Date;
}

/** 撤回的授權與時限判斷所需的最小資訊，不含內容 */
export interface MessageOwnership {
  messageId: string;
  senderId: string;
  createdAt: Date;
  retractedAt: Date | null;
}

export interface AppendMessageInput {
  roomId: string;
  senderId: string;
  content: string;
  clientMessageId: string;
}

export interface AppendMessageResult {
  message: ChatMessage;
  /** true 代表這是重送：訊息早已存在，本次沒有新增任何東西 */
  deduplicated: boolean;
}

export interface ChatMessageRepositoryPort {
  /**
   * 配號並寫入訊息。
   *
   * **配號與寫入必須在同一個交易內。** 分成兩步時，中間失敗會讓號碼被吃掉而在
   * `seq` 序列上留下洞——而補齊的客戶端無法區分「這個號碼被跳過」與「我漏收了」。
   *
   * 撞到 `(roomId, clientMessageId)` 唯一索引時回傳既有訊息並標記 `deduplicated`，
   * 讓「重送」與「首次送出」對呼叫端一致。
   */
  append(input: AppendMessageInput): Promise<AppendMessageResult>;

  /** 取 `seq` 大於指定值的訊息，由舊到新——供斷線補齊 */
  findAfterSeq(
    roomId: string,
    afterSeq: number,
    limit: number,
  ): Promise<ChatMessage[]>;

  /** 取 `seq` 小於指定值的訊息，由新到舊——供歷史查詢往回翻頁 */
  findBeforeSeq(
    roomId: string,
    beforeSeq: number | undefined,
    limit: number,
  ): Promise<ChatMessage[]>;

  /**
   * 取撤回判斷所需的最小資訊；訊息不存在或不屬於該房間時回 null。
   *
   * 刻意不回傳完整訊息：這條路徑只需要「誰發的、何時發的、是否已撤回」，
   * 多回傳內容等於在授權判斷之前就把它取出來。
   */
  findOwnership(
    roomId: string,
    messageId: string,
  ): Promise<MessageOwnership | null>;

  /**
   * 標記撤回。**不刪除該列**——刪了 seq 會出現洞。
   *
   * @returns 撤回時間；該則已撤回時回傳原本的時間（冪等）
   */
  retract(messageId: string, retractedBy: string): Promise<Date>;
}
