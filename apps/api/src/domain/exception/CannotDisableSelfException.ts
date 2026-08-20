import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class CannotDisableSelfException extends DomainException {
  constructor() {
    super(ResponseCodes.CANNOT_DISABLE_SELF, 'CONFLICT');
  }
}
