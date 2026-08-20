export const CHAT_ROOM_REPOSITORY_PORT = 'CHAT_ROOM_REPOSITORY_PORT';

/** 房間類型；與 DB 的 `chat_rooms.room_type` 對應 */
export type ChatRoomType = 'DIRECT' | 'GROUP';

/** 房間的列表／回應共用視圖 */
export interface ChatRoomSummary {
  id: string;
  roomType: ChatRoomType;
  /** 群組名稱；私聊為 null（顯示名稱由對方決定，不落庫） */
  name: string | null;
  memberCount: number;
  createdAt: Date;
}

export interface ListMyRoomsParams {
  memberId: string;
  page: number;
  limit: number;
}

export interface ListMyRoomsPage {
  data: ChatRoomSummary[];
  total: number;
}

export interface CreateDirectRoomInput {
  /** 由 `directKeyOf()` 產生，唯一性的判斷依據 */
  directKey: string;
  memberIds: [string, string];
  createdBy: string;
}

export interface CreateGroupRoomInput {
  name: string;
  /** 不含建立者；建立者由實作自行加入 */
  memberIds: string[];
  createdBy: string;
}

export interface ChatRoomRepositoryPort {
  /**
   * 建立私聊房間；`directKey` 撞唯一鍵時回傳既有房間。
   *
   * 「回傳既有」的處理必須留在這一層：它是 Prisma 的 P2002，
   * 讓 service 認得資料庫錯誤碼等於把持久層細節漏進 application 層。
   */
  findOrCreateDirect(input: CreateDirectRoomInput): Promise<ChatRoomSummary>;
  createGroup(input: CreateGroupRoomInput): Promise<ChatRoomSummary>;
  listByMember(params: ListMyRoomsParams): Promise<ListMyRoomsPage>;
  isMember(roomId: string, memberId: string): Promise<boolean>;
  /** 移除成員關係；回傳 false 表示本來就不是成員 */
  removeMember(roomId: string, memberId: string): Promise<boolean>;
  countMembers(roomId: string): Promise<number>;
  /** 房間目前已配出的最大訊息序號；房間不存在時回 null */
  getLastSeq(roomId: string): Promise<number | null>;
}
