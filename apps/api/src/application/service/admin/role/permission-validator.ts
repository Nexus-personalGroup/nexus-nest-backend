import { InvalidPermissionCodeException } from '@app/domain/exception/InvalidPermissionCodeException';
import { InvalidPermissionCombinationException } from '@app/domain/exception/InvalidPermissionCombinationException';
import { PermissionRepositoryPort } from '../../../port/out/role/PermissionRepositoryPort';

/**
 * 共用權限驗證邏輯：檢查 code 存在於目錄，並驗證 EDIT 必須搭配 VIEW。
 *
 * ⚠️ **「必須搭配 VIEW」只在該模組也提供 VIEW 時成立。**
 * 有些模組刻意只有 EDIT——附件只有 `BACKEND:ATTACHMENT:EDIT`
 * （上傳與刪除都是寫入操作，沒有「只能看」的場景）。
 * 無條件要求 VIEW 會索取一個目錄裡不存在的碼，
 * 使該權限**永遠不可能被指派給任何角色**：它存在、畫得出來、就是存不進去。
 *
 * 判斷依權限目錄而非字串推導——驗證流程本來就要查目錄確認每個碼存在，
 * 多查一次要求的 VIEW 碼即可回答「它存不存在」。
 */
export const validatePermissions = async (
  codes: string[],
  permissionRepo: PermissionRepositoryPort,
): Promise<void> => {
  if (codes.length === 0) return;

  const editDomains = codes
    .map((code) => code.split(':'))
    .filter((parts) => parts.length === 3 && parts[2] === 'EDIT')
    .map((parts) => `${parts[0]}:${parts[1]}`);

  // 一次查完：使用者送的碼 + 對應的 VIEW 碼。
  // 分兩次查會讓「第二次查什麼」變成隱含契約，測試的 mock 很容易對不上
  const found = await permissionRepo.findByCodes([
    ...new Set([...codes, ...editDomains.map((d) => `${d}:VIEW`)]),
  ]);
  const foundCodes = new Set(found.map((p) => p.permissionCode));

  // 只檢查使用者實際送出的碼；衍生的 VIEW 碼不存在是正常的
  const missing = codes.filter((c) => !foundCodes.has(c));
  if (missing.length > 0) throw new InvalidPermissionCodeException(missing);

  const codeSet = new Set(codes);
  for (const domain of editDomains) {
    const viewCode = `${domain}:VIEW`;
    // 目錄裡沒有這個 VIEW → 該模組刻意只有 EDIT，不套用蘊含規則
    if (!foundCodes.has(viewCode)) continue;
    if (!codeSet.has(viewCode)) {
      throw new InvalidPermissionCombinationException(domain);
    }
  }
};
