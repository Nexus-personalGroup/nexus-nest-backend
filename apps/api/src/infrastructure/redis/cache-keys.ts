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

/**
 * 成員的在線連線集合（Hash）。field 為 `{instanceId}:{socketId}`，value 為最後心跳時間。
 *
 * 用 Hash 而非 Set：Set 的成員沒有各自的時效，實例被強制終止時來不及清理，
 * 該成員會被永遠顯示為在線。把心跳時間存在 value 才能過濾掉陳舊的連線。
 */
export const buildPresenceKey = (prefix: string, memberId: string): string =>
  `${prefix}presence:member:${memberId}`;

/** 掃描所有 presence key 的 pattern，供排程 sweep 使用（不可用於請求路徑） */
export const buildPresenceScanPattern = (prefix: string): string =>
  `${prefix}presence:member:*`;
