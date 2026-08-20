import { useCurrentMember } from './use-current-member';

/**
 * 檢查目前登入使用者是否有指定 permission code
 * 後端是真實權限來源（401/403 仍會擋下），前端這層只做 UX 預防誤點
 */
export const useHasPermission = (code: string): boolean => {
  const { permissions } = useCurrentMember();
  return permissions.includes(code);
};
