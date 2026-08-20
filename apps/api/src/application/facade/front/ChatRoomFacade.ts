import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_MY_ROOMS_USE_CASE,
  ListMyRoomsQuery,
  ListMyRoomsResult,
  ListMyRoomsUseCase,
} from '../../port/in/front/chat-room/ListMyRoomsUseCase';
import {
  CREATE_DIRECT_ROOM_USE_CASE,
  CreateDirectRoomCommand,
  CreateDirectRoomUseCase,
} from '../../port/in/front/chat-room/CreateDirectRoomUseCase';
import {
  CREATE_GROUP_ROOM_USE_CASE,
  CreateGroupRoomCommand,
  CreateGroupRoomUseCase,
} from '../../port/in/front/chat-room/CreateGroupRoomUseCase';
import {
  LEAVE_ROOM_USE_CASE,
  LeaveRoomCommand,
  LeaveRoomUseCase,
} from '../../port/in/front/chat-room/LeaveRoomUseCase';
import type { ChatRoomSummary } from '../../port/out/chat-room/ChatRoomRepositoryPort';

@Injectable()
export class ChatRoomFacade {
  constructor(
    @Inject(LIST_MY_ROOMS_USE_CASE)
    private readonly listMyRoomsUseCase: ListMyRoomsUseCase,
    @Inject(CREATE_DIRECT_ROOM_USE_CASE)
    private readonly createDirectRoomUseCase: CreateDirectRoomUseCase,
    @Inject(CREATE_GROUP_ROOM_USE_CASE)
    private readonly createGroupRoomUseCase: CreateGroupRoomUseCase,
    @Inject(LEAVE_ROOM_USE_CASE)
    private readonly leaveRoomUseCase: LeaveRoomUseCase,
  ) {}

  listMyRooms(query: ListMyRoomsQuery): Promise<ListMyRoomsResult> {
    return this.listMyRoomsUseCase.execute(query);
  }

  createDirectRoom(command: CreateDirectRoomCommand): Promise<ChatRoomSummary> {
    return this.createDirectRoomUseCase.execute(command);
  }

  createGroupRoom(command: CreateGroupRoomCommand): Promise<ChatRoomSummary> {
    return this.createGroupRoomUseCase.execute(command);
  }

  leaveRoom(command: LeaveRoomCommand): Promise<void> {
    return this.leaveRoomUseCase.execute(command);
  }
}
