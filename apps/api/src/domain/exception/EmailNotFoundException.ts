import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class EmailNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.EMAIL_NOT_FOUND, 'NOT_FOUND');
  }
}
