import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 房間不存在，**或呼叫者不是該房間成員**——兩種情況刻意共用同一個例外。
 *
 * 分開回報等於提供一個探測工具：拿任意 roomId 打一次，
 * 「不存在」與「你不是成員」的差異就洩漏了該房間是否存在。
 *
 * 用 NOT_FOUND 而非 FORBIDDEN 也是同樣的理由——回 403 本身就是在說「它存在」。
 */
export class ChatRoomNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_ROOM_NOT_FOUND, 'NOT_FOUND');
  }
}
