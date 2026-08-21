import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 超過撤回時限。
 *
 * **刻意不與 `ChatMessageNotFoundException` 共用**：能走到這裡代表訊息確實存在
 * 且確實是呼叫者發送的，沒有任何洩漏疑慮。共用的話使用者只會看到「訊息不存在」，
 * 而他明明看得到那則訊息——分開才給得出可行動的提示。
 */
export class ChatMessageRetractExpiredException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_MESSAGE_RETRACT_EXPIRED, 'FORBIDDEN');
  }
}
