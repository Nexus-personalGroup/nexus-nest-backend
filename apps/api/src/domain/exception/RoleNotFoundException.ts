import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class RoleNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.ROLE_NOT_FOUND, 'NOT_FOUND');
  }
}
