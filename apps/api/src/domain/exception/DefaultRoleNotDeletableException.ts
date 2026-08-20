import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class DefaultRoleNotDeletableException extends DomainException {
  constructor() {
    super(ResponseCodes.DEFAULT_ROLE_NOT_DELETABLE, 'INVALID');
  }
}
