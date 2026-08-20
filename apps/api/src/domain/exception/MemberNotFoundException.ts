import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';
import { ResponseMessages } from '../../shared/constants/response-messages';

/**
 * 帳號不存在
 */
export class MemberNotFoundException extends DomainException {
  constructor(id?: string) {
    super(
      ResponseCodes.MEMBER_NOT_FOUND,
      'NOT_FOUND',
      ResponseMessages.MEMBER_NOT_FOUND(id),
    );
  }
}
