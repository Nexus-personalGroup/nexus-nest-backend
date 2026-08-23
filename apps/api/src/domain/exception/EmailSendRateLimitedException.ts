import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 對同一個信箱寄信過於頻繁
 *
 * **這一個刻意會回 429，不套用「一律 204」的規則。** 限流是對呼叫者的資源限制，
 * 與「這個信箱有沒有註冊過」無關——同一個未註冊的信箱連打三次一樣會被擋，
 * 所以它不洩漏任何東西。
 */
export class EmailSendRateLimitedException extends DomainException {
  constructor() {
    super(ResponseCodes.EMAIL_SEND_RATE_LIMITED, 'RATE_LIMITED');
  }
}
