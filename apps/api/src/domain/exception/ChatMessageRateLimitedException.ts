import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 送訊息超過限流閾值。
 *
 * HTTP 端有全域 throttle middleware，**WebSocket 完全不經過它**——連線建立後的每個事件
 * 都是同一條 TCP 連線上的訊框，沒有任何一層會計次。送訊息是本專案第一個
 * 「使用者可以無限次觸發、且每次都寫資料庫」的 WS 事件。
 */
export class ChatMessageRateLimitedException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_MESSAGE_RATE_LIMITED, 'RATE_LIMITED');
  }
}
