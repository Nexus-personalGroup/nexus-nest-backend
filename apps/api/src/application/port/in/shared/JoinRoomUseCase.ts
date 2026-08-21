export const JOIN_ROOM_USE_CASE = 'JOIN_ROOM_USE_CASE';

/**
 * 取得「這條連線可以加入這個房間」的許可，並留下稽核紀錄。
 *
 * 與 `EnsureRoomMembershipUseCase` 分開是刻意的：後者是**唯讀判斷**，
 * 送訊息、補齊都會呼叫它，在那裡記稽核等於每則訊息都寫一筆。
 * 加入房間是一個獨立的、值得記錄的動作。
 */
export interface JoinRoomUseCase {
  execute(memberId: string, roomId: string): Promise<void>;
}
