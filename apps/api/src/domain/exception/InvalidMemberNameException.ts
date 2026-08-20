import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 帳號名稱為空或僅含空白
 */
export class InvalidMemberNameException extends DomainException {
  constructor() {
    super(ResponseCodes.INVALID_MEMBER_NAME, 'INVALID');
  }
}
