import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 帳號已被鎖定時拋出
 */
export class AccountLockedException extends DomainException {
  constructor() {
    super(ResponseCodes.ACCOUNT_LOCKED, 'LOCKED');
  }
}
