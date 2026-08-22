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

/**
 * 後台視角的房間摘要。
 *
 * 與 `ChatRoomSummary` 分開而不是加欄位：前者是**成員視角**（前台「我的房間」用），
 * 而 `messageCount` 對終端使用者沒有意義。同一個型別服務兩種視角，
 * 遲早會有人在前台的回應裡看到後台才該有的數字。
 */
export interface AdminRoomSummary {
  roomId: string;
  roomType: ChatRoomType;
  /** 群組名稱；私聊為 null */
  name: string | null;
  memberCount: number;
  /**
   * 歷史訊息總數，取自 `chat_rooms.last_seq`。
   *
   * **語意是「曾經有多少則」**，含已撤回與已被移除的訊息。
   * 訊息列永遠不會被刪除（刪了會讓 seq 出現洞），所以它與 `count(*)` 目前相等——
   * 但它不需要多一次查詢，而且在日後真的做了清理時仍然誠實。
   */
  messageCount: number;
  createdAt: Date;
}

export interface AdminRoomMember {
  memberId: string;
  joinedAt: Date;
}

export interface AdminRoomDetail extends AdminRoomSummary {
  members: AdminRoomMember[];
}

export interface ListAllRoomsParams {
  /** 未指定表示不篩選 */
  roomType?: ChatRoomType;
  page: number;
  limit: number;
}

export interface ListAllRoomsPage {
  data: AdminRoomSummary[];
  total: number;
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

  /**
   * 後台的房間列表。
   *
   * **與 `listByMember` 分開而不是加一個 optional memberId**：
   * 兩者的語意不同（「某人的房間」與「全部房間」），
   * 混在同一個查詢裡會讓「忘了帶 memberId」變成一個看不出來的越權。
   */
  listAll(params: ListAllRoomsParams): Promise<ListAllRoomsPage>;

  /** 後台的單一房間概覽，含成員清單；房間不存在時回 null */
  findAdminDetail(roomId: string): Promise<AdminRoomDetail | null>;
}
