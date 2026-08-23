import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 信箱尚未驗證
 *
 * 回 403 而非 401：使用者的身分是有效的（token 沒問題），
 * 是這個帳號還不被允許做這件事。回 401 會讓客戶端誤以為要重新登入。
 */
export class EmailNotVerifiedException extends DomainException {
  constructor() {
    super(ResponseCodes.EMAIL_NOT_VERIFIED, 'FORBIDDEN');
  }
}
