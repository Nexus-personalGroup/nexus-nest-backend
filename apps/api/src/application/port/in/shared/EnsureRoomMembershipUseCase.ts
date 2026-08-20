export const ENSURE_ROOM_MEMBERSHIP_USE_CASE =
  'ENSURE_ROOM_MEMBERSHIP_USE_CASE';

/**
 * 判斷某成員是否屬於某房間，不屬於就拋 `ChatRoomNotFoundException`。
 *
 * 放在 shared 而非 front 之下：它同時服務 REST 與 WebSocket，而 WS 不是一個「側」。
 * 它也是 `ResolveMemberContextUseCase` 的同一個教訓——M1 的 WS 認證當初若是各自實作，
 * 就會有一份漏掉 tokenVersion 檢查的版本。**「可不可以碰這個房間」只能有一個答案來源**，
 * 兩處各自查 DB，日後加上封鎖或退出中狀態時必然只改到一處。
 */
export interface EnsureRoomMembershipUseCase {
  execute(memberId: string, roomId: string): Promise<void>;
}
