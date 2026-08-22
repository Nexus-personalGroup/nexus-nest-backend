export const CHAT_MESSAGE_REPOSITORY_PORT = 'CHAT_MESSAGE_REPOSITORY_PORT';

export interface ChatMessage {
  messageId: string;
  roomId: string;
  senderId: string;
  /** 已撤回或已被移除時為空字串——遮蔽發生在 repository 的投影函式，呼叫端拿不到原內容 */
  content: string;
  seq: number;
  /** 使用者自己撤回的時間；null 代表未撤回 */
  retractedAt: Date | null;
  /**
   * 管理員移除的時間；null 代表未被移除。
   *
   * 與 `retractedAt` 分開：兩者對客戶端的語意不同（「對方自己收回」vs「被平台處理」）。
   * 兩個標記可以同時存在，呈現上以移除優先。
   */
  removedAt: Date | null;
  createdAt: Date;
}

/**
 * 檢舉所需的訊息資訊，**含未遮蔽的原始內容**。
 *
 * 這是唯一會回傳被撤回訊息內容的取值路徑，而且刻意做得很窄：
 * 只有「檢舉」這一個用途需要它——被撤回的訊息也必須能被檢舉，
 * 而檢舉的價值在於留下當下那句話。
 *
 * **不要把它擴充成泛用的「取原始內容」方法。** 那會直接變成繞過遮蔽的洩漏管道，
 * 而遮蔽只寫在 `toMessage()` 一處正是整個設計的前提。
 */
export interface MessageForReport {
  messageId: string;
  roomId: string;
  senderId: string;
  /** 未遮蔽的原始內容——即使該則已撤回 */
  rawContent: string;
}

/**
 * 管理員移除／還原所需的資訊，**不含內容**。
 *
 * 與 `MessageOwnership` 分開是因為入口不同：撤回從房間端進來（已知 roomId），
 * 管理員只有 messageId——後台可能從私訊、主動巡邏等管道發現違規內容，
 * 而不是從某個房間點進去。
 */
export interface MessageModerationTarget {
  messageId: string;
  roomId: string;
  senderId: string;
  seq: number;
  retractedAt: Date | null;
  removedAt: Date | null;
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
   * 取檢舉所需的訊息資訊（含未遮蔽的原始內容）；不存在時回 null。
   *
   * **僅供檢舉使用。** 它是唯一繞過 `toMessage()` 遮蔽的路徑，
   * 因此呼叫端只能有一個——多一個就多一條洩漏管道。
   */
  findForReport(messageId: string): Promise<MessageForReport | null>;

  /**
   * 標記撤回。**不刪除該列**——刪了 seq 會出現洞。
   *
   * @returns 撤回時間；該則已撤回時回傳原本的時間（冪等）
   */
  retract(messageId: string, retractedBy: string): Promise<Date>;

  /**
   * 取管理員移除／還原所需的資訊；不存在時回 null。
   *
   * 不需要 roomId：管理員的入口是訊息本身，不是房間。同樣不回傳內容——
   * 這條路徑不需要它，而不取就沒有洩漏的可能。
   */
  findForModeration(messageId: string): Promise<MessageModerationTarget | null>;

  /**
   * 某時間點之後寫入的訊息數。
   *
   * **這是唯一不需要 roomId 的計數**，供營運總覽的「今日訊息數」。
   * 走 `idx_chat_messages_created_at`（BRIN）——這張表是 append-only，
   * 要掃的正好是最後幾個區塊。
   */
  countSince(since: Date): Promise<number>;

  /**
   * 管理員移除。同樣是軟刪除、同樣不碰 `retractedAt`。
   *
   * @returns 移除時間；已移除時回 null（沒有任何改變，呼叫端據此不推播）
   */
  remove(messageId: string, removedBy: string): Promise<Date | null>;

  /**
   * 還原被移除的訊息。**不碰 `retractedAt`**——若該則原本已被發送者撤回，
   * 還原後它應回到「已收回」而非完全正常。
   *
   * @returns 還原後的撤回狀態；該則本來就沒被移除時回 null（沒有任何改變）
   */
  restore(messageId: string): Promise<{ retractedAt: Date | null } | null>;
}
