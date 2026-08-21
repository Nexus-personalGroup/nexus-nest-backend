import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 嘗試把檢舉的狀態改回 `PENDING`。
 *
 * `REVIEWED` 與 `DISMISSED` 之間可以互轉——那是終態間的更正；
 * 但回到待處理是「重新開啟」，語意不同且目前沒有這個需求。
 */
export class ChatReportInvalidTransitionException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_REPORT_INVALID_TRANSITION, 'INVALID');
  }
}
