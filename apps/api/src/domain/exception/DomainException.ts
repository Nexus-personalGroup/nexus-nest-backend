import type { ResponseCode } from '../../shared/constants/response-codes';
import {
  ResponseMessages,
  type StaticResponseCode,
} from '../../shared/constants/response-messages';

/**
 * Domain exception 的語意類別。GlobalExceptionFilter 以此映射成 HTTP status，
 * 不依賴 NestJS / HTTP —— 新增 domain exception 只需選一個 kind，filter 完全不用改。
 */
export type DomainExceptionKind =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID'
  | 'CONFLICT'
  | 'LOCKED'
  | 'INTERNAL';

/**
 * 所有 domain exception 的共用基底：自帶業務 `code` 與語意 `kind`，
 * filter 據此組出 `{ status, code, message }`，毋須維護「例外 → status/code」對照表。
 *
 * 訊息一律取自 `ResponseMessages`，子類不得內嵌文案字面值。建構子重載讓型別分流：
 * 靜態訊息只需 `(code, kind)`；需要參數的訊息**必須**傳入算好的字串，
 * 漏傳會編譯失敗，不會出現「函式被當成訊息」的執行期怪象。
 */
export abstract class DomainException extends Error {
  readonly code: string;
  readonly kind: DomainExceptionKind;

  constructor(code: StaticResponseCode, kind: DomainExceptionKind);
  constructor(code: ResponseCode, kind: DomainExceptionKind, message: string);
  constructor(code: ResponseCode, kind: DomainExceptionKind, message?: string) {
    const preset = ResponseMessages[code];
    // 重載簽名已保證「省略 message 時 code 必為靜態訊息」，故 typeof 檢查恆為真；
    // 退路取 code 本身而非空字串，確保任何情況下訊息都不會是空的
    super(message ?? (typeof preset === 'string' ? preset : code));
    this.name = new.target.name;
    this.code = code;
    this.kind = kind;
  }
}
