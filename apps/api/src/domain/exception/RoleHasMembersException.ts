import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';
import { ResponseMessages } from '../../shared/constants/response-messages';

export class RoleHasMembersException extends DomainException {
  constructor(count: number) {
    super(
      ResponseCodes.ROLE_HAS_MEMBERS,
      'CONFLICT',
      ResponseMessages.ROLE_HAS_MEMBERS(count),
    );
  }
}
