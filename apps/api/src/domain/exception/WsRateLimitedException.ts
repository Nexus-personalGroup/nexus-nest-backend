import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 單一連線的事件速率超過門檻。
 *
 * **刻意不重用 `ChatMessageRateLimitedException`。** 兩者是不同層的防線：
 * 這一個代表「這條連線送得太快」，客戶端該做的是退避；
 * 那一個代表「你在這個房間發太多訊息」，客戶端該做的是提示使用者。
 * 共用錯誤碼會讓客戶端無法分辨該用哪種退避策略。
 */
export class WsRateLimitedException extends DomainException {
  constructor() {
    super(ResponseCodes.WS_RATE_LIMITED, 'RATE_LIMITED');
  }
}
