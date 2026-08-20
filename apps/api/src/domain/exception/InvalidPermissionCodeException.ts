import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';
import { ResponseMessages } from '../../shared/constants/response-messages';

export class InvalidPermissionCodeException extends DomainException {
  constructor(codes: string[]) {
    super(
      ResponseCodes.INVALID_PERMISSION_CODE,
      'INVALID',
      ResponseMessages.INVALID_PERMISSION_CODE(codes),
    );
  }
}
