import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';
import { ResponseMessages } from '../../shared/constants/response-messages';

/** 上傳不合法（MIME / 大小 / folder 白名單等），回 400 */
export class InvalidUploadException extends DomainException {
  constructor(reason: string) {
    super(
      ResponseCodes.INVALID_UPLOAD,
      'INVALID',
      ResponseMessages.INVALID_UPLOAD(reason),
    );
  }
}
