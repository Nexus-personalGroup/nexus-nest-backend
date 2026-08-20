import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';
import { ResponseMessages } from '../../shared/constants/response-messages';

export class DuplicateRoleNameException extends DomainException {
  constructor(name: string) {
    super(
      ResponseCodes.DUPLICATE_ROLE_NAME,
      'CONFLICT',
      ResponseMessages.DUPLICATE_ROLE_NAME(name),
    );
  }
}
