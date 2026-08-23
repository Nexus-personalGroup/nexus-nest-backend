import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 一次性 token 無效
 *
 * **無效、過期、已使用、用途不符共用這一個例外**，刻意不分開。
 * 分開的話，「這個 token 過期了」與「這個 token 不存在」就變成兩種可觀察的結果，
 * 而那足以拿來確認某個 token 曾經存在過。
 */
export class InvalidTokenException extends DomainException {
  constructor() {
    super(ResponseCodes.INVALID_TOKEN, 'INVALID');
  }
}
