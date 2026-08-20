import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class DefaultMemberNotEditableException extends DomainException {
  constructor() {
    super(ResponseCodes.DEFAULT_MEMBER_NOT_EDITABLE, 'CONFLICT');
  }
}
