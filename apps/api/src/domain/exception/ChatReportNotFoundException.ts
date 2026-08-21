import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 檢舉不存在。
 *
 * 這裡不需要與其他錯誤共用來防探測：能呼叫本端點的人已經通過
 * `BACKEND:MODERATION:VIEW` 的授權，「某筆檢舉存不存在」對他不是敏感資訊。
 */
export class ChatReportNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_REPORT_NOT_FOUND, 'NOT_FOUND');
  }
}
