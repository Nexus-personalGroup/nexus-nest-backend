import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class DefaultRoleNotEditableException extends DomainException {
  constructor() {
    super(ResponseCodes.DEFAULT_ROLE_NOT_EDITABLE, 'INVALID');
  }
}
