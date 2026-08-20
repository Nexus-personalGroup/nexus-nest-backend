export const CHAT_MESSAGE_REPOSITORY_PORT = 'CHAT_MESSAGE_REPOSITORY_PORT';

export interface ChatMessage {
  messageId: string;
  roomId: string;
  senderId: string;
  content: string;
  seq: number;
  createdAt: Date;
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
}
