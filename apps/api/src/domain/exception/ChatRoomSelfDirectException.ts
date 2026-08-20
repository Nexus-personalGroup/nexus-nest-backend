import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/** 嘗試與自己建立 1:1 私聊。directKey 會退化成 `id:id`，且沒有任何有意義的使用情境 */
export class ChatRoomSelfDirectException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_ROOM_SELF_DIRECT, 'INVALID');
  }
}
