import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/** 找不到附件，回 404 */
export class AttachmentNotFoundException extends DomainException {
  constructor() {
    super(ResponseCodes.ATTACHMENT_NOT_FOUND, 'NOT_FOUND');
  }
}
