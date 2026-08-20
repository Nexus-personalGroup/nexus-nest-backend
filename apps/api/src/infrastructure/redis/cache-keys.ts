/**
 * 集中管理 Redis Key 格式。
 * 所有需要組合 key 的地方都引用此函式，確保格式一致。
 * 若格式需要調整（如加入 namespace），只需修改此處。
 */
export const buildMemberContextKey = (
  prefix: string,
  memberId: string,
): string => `${prefix}member:${memberId}`;

export const buildFailedLoginKey = (prefix: string, email: string): string =>
  `${prefix}failed-login:${email}`;

export const buildFailedIpKey = (prefix: string, ip: string): string =>
  `${prefix}failed-ip:${ip}`;

export const buildSessionActivityKey = (
  prefix: string,
  memberId: string,
): string => `${prefix}session:activity:${memberId}`;

export const buildPasswordResetKey = (prefix: string, token: string): string =>
  `${prefix}password-reset:${token}`;
