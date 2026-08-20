import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 帳號已停用
 */
export class AccountDisabledException extends DomainException {
  constructor() {
    super(ResponseCodes.ACCOUNT_DISABLED, 'FORBIDDEN');
  }
}
