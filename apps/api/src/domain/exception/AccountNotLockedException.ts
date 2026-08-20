import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class AccountNotLockedException extends DomainException {
  constructor() {
    super(ResponseCodes.ACCOUNT_NOT_LOCKED, 'CONFLICT');
  }
}
