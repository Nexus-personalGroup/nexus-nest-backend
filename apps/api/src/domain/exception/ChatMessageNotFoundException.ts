import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 訊息不存在、不屬於該房間，**或不是呼叫者發送的**——三種情況共用同一個例外。
 *
 * 分開回報等於提供探測工具：拿任意 messageId 打一次，「不存在」與「不是你的」
 * 的差異就洩漏了該訊息是否存在。
 */
export class ChatMessageNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_MESSAGE_NOT_FOUND, 'NOT_FOUND');
  }
}
