import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * Email 格式不合法
 */
export class InvalidEmailException extends DomainException {
  constructor() {
    super(ResponseCodes.INVALID_EMAIL_FORMAT, 'INVALID');
  }
}
