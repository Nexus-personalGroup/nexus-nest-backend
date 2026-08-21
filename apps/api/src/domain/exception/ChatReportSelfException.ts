import { DomainException } from './DomainException';
import { ResponseCodes } from '@app/shared/constants/response-codes';

/**
 * 檢舉自己發送的訊息。
 *
 * 那不是檢舉，而且會是繞過撤回時限的側門——「檢舉自己」讓管理員刪掉它。
 *
 * 不與 `ChatMessageNotFoundException` 共用：能走到這裡代表訊息確實存在且確實是
 * 呼叫者自己發的，沒有洩漏疑慮。
 */
export class ChatReportSelfException extends DomainException {
  constructor() {
    super(ResponseCodes.CHAT_REPORT_SELF, 'INVALID');
  }
}
