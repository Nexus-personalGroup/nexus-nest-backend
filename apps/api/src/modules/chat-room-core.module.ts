import { Module } from '@nestjs/common';
import { PrismaChatRoomRepository } from '../adapter/out/persistence/chat-room/PrismaChatRoomRepository';
import { PrismaChatMessageRepository } from '../adapter/out/persistence/chat-message/PrismaChatMessageRepository';
import { CHAT_ROOM_REPOSITORY_PORT } from '../application/port/out/chat-room/ChatRoomRepositoryPort';
import { CHAT_MESSAGE_REPOSITORY_PORT } from '../application/port/out/chat-message/ChatMessageRepositoryPort';
import { ENSURE_ROOM_MEMBERSHIP_USE_CASE } from '../application/port/in/shared/EnsureRoomMembershipUseCase';
import { EnsureRoomMembershipService } from '../application/service/shared/EnsureRoomMembershipService';

/**
 * 房間的持久層與成員資格判斷。
 *
 * 存在的理由是**打斷循環相依**：WS gateway 需要成員資格判斷，而前台的離開房間
 * 需要 WS 的事件送出端。兩者放同一個模組會讓 `FrontChatRoomModule` 與
 * `ChatWsModule` 互相 import，NestJS 會在啟動時失敗（或更糟，用 forwardRef 遮掉）。
 *
 * 本模組**刻意不相依 ChatWsModule**——它只碰資料庫。這個限制要維持住：
 * 一旦這裡開始送事件，循環就回來了。因此送訊息（要廣播）不在這裡，
 * 只有它用得到的 repository 在這裡。
 */
@Module({
  providers: [
    PrismaChatRoomRepository,
    {
      provide: CHAT_ROOM_REPOSITORY_PORT,
      useExisting: PrismaChatRoomRepository,
    },
    {
      provide: ENSURE_ROOM_MEMBERSHIP_USE_CASE,
      useClass: EnsureRoomMembershipService,
    },
    PrismaChatMessageRepository,
    {
      provide: CHAT_MESSAGE_REPOSITORY_PORT,
      useExisting: PrismaChatMessageRepository,
    },
  ],
  exports: [
    CHAT_ROOM_REPOSITORY_PORT,
    CHAT_MESSAGE_REPOSITORY_PORT,
    ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  ],
})
export class ChatRoomCoreModule {}
