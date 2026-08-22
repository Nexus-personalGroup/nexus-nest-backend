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

/**
 * 目前有在線連線的成員 ID 集合。
 *
 * **這是衍生索引，不是連線紀錄。** 真相仍然在 `presence:member:*` 的 Hash 上
 * （每筆連線帶心跳時間、由 TTL 與 sweep 回收）——本 Set 只是為了讓
 * 「在線人數」變成 O(1) 的 `SCARD` 而存在的投影。
 *
 * 因此它**不牴觸**「不得用無時效集合儲存連線」那條規則：被禁止的是把連線本身
 * 存成集合（實例被 kill 時無法自動恢復），而這裡任何**在線與否的判斷**
 * 讀的仍然是 Hash。Set 壞掉只會讓統計數字暫時不準，不會給出錯的狀態。
 *
 * 漂移由 sweep 的既有遍歷以差集校正——實例被強制終止時 `markOffline` 不會執行。
 */
export const buildOnlineMembersKey = (prefix: string): string =>
  `${prefix}presence:online-members`;

/** 掃描所有 presence key 的 pattern，供排程 sweep 使用（不可用於請求路徑） */
export const buildPresenceScanPattern = (prefix: string): string =>
  `${prefix}presence:member:*`;
