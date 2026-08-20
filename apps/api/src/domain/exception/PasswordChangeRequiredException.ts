import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 密碼已過期需要更換時拋出。
 * GlobalExceptionFilter 會將此 exception 映射為 403 + PASSWORD_CHANGE_REQUIRED code。
 */
export class PasswordChangeRequiredException extends DomainException {
  constructor() {
    super(ResponseCodes.PASSWORD_CHANGE_REQUIRED, 'FORBIDDEN');
  }
}
