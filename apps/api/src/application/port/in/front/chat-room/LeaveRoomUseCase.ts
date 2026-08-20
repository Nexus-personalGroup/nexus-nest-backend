export const LEAVE_ROOM_USE_CASE = 'LEAVE_ROOM_USE_CASE';

export interface LeaveRoomCommand {
  roomId: string;
  memberId: string;
}

export interface LeaveRoomUseCase {
  execute(command: LeaveRoomCommand): Promise<void>;
}
