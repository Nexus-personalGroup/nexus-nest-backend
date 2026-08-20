import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';
import { ResponseMessages } from '../../shared/constants/response-messages';

export class InvalidPermissionCombinationException extends DomainException {
  constructor(domain: string) {
    super(
      ResponseCodes.INVALID_PERMISSION_COMBINATION,
      'INVALID',
      ResponseMessages.INVALID_PERMISSION_COMBINATION(domain),
    );
  }
}
