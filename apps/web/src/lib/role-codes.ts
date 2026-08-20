/**
 * 與後端 `RoleCode` enum 對齊的常數集中處。
 * 前端比對 `roleCode === ROLE_CODE.SUPERADMIN` 而非 magic string，
 * 未來新增 role code 時改這一處就夠
 */
export const ROLE_CODE = {
  SUPERADMIN: 'SUPERADMIN',
} as const;

export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];
