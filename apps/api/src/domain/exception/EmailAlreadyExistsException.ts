import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super(ResponseCodes.EMAIL_ALREADY_EXISTS, 'CONFLICT');
  }
}
