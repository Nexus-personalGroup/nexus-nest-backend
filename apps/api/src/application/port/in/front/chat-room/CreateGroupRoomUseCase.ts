import type { ChatRoomSummary } from '../../../out/chat-room/ChatRoomRepositoryPort';

export const CREATE_GROUP_ROOM_USE_CASE = 'CREATE_GROUP_ROOM_USE_CASE';

export interface CreateGroupRoomCommand {
  /** 呼叫者自己；自動成為成員 */
  memberId: string;
  name: string;
  memberIds: string[];
}

export interface CreateGroupRoomUseCase {
  execute(command: CreateGroupRoomCommand): Promise<ChatRoomSummary>;
}
