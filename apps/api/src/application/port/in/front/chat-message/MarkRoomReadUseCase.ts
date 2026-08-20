export const MARK_ROOM_READ_USE_CASE = 'MARK_ROOM_READ_USE_CASE';

export interface MarkRoomReadCommand {
  roomId: string;
  memberId: string;
  lastReadSeq: number;
}

export interface MarkRoomReadUseCase {
  execute(command: MarkRoomReadCommand): Promise<void>;
}
