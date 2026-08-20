import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 帳號 ID 格式不合法
 */
export class InvalidMemberIdException extends DomainException {
  constructor() {
    super(ResponseCodes.INVALID_MEMBER_ID, 'INVALID');
  }
}
