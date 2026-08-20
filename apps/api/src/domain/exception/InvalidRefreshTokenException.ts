import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 無效的 Refresh Token
 *
 * 過期、簽名不符、type 不符、在黑名單一律以此例外表達。
 */
export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super(ResponseCodes.INVALID_REFRESH_TOKEN, 'UNAUTHORIZED');
  }
}
