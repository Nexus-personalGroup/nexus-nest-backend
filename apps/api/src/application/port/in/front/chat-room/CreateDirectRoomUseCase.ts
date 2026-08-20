import type { ChatRoomSummary } from '../../../out/chat-room/ChatRoomRepositoryPort';

export const CREATE_DIRECT_ROOM_USE_CASE = 'CREATE_DIRECT_ROOM_USE_CASE';

export interface CreateDirectRoomCommand {
  /** 呼叫者自己；由 MemberContext 帶入，不接受客戶端指定 */
  memberId: string;
  targetMemberId: string;
}

export interface CreateDirectRoomUseCase {
  execute(command: CreateDirectRoomCommand): Promise<ChatRoomSummary>;
}
