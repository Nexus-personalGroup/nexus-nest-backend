import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 非上傳者且非 SUPERADMIN 嘗試刪除附件，回 403。
 *
 * 權限碼只能擋「有沒有資格碰附件」，擋不住「有資格的 A 刪掉 B 的附件」——
 * 刪除會一併移除實體檔案且不可逆，必須另有擁有者層級的判斷。
 */
export class AttachmentForbiddenException extends DomainException {
  constructor() {
    super(ResponseCodes.ATTACHMENT_FORBIDDEN, 'FORBIDDEN');
  }
}
