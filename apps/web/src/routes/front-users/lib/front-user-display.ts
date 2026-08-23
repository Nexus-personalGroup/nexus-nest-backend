/**
 * `lastSeenAt` 的語意提示。
 *
 * 它**只在登入與換發 token 時更新**，不隨 WS 心跳前進。不標的話
 * 「最後活動」會被讀成「最後上線」，而一個三天沒登入但天天在聊天的人
 * 會被誤判為不活躍。
 */
export const LAST_SEEN_HINT =
  '最後一次登入或換發憑證的時間，不等於最後上線時間';

/** 缺處置權限時的 tooltip 文案。與檢舉審閱共用同一句，避免兩處說法不一致 */
export const NO_EDIT_PERMISSION = '無處置權限';

/**
 * 頭像的替代文字：顯示名稱的第一個字元。
 *
 * 用 `Array.from` 而非 `[0]`：emoji 與部分中日文字是 surrogate pair，
 * 直接取 index 0 會拿到半個字元並顯示成方框。
 */
export const avatarFallback = (displayName: string): string =>
  Array.from(displayName.trim())[0] ?? '?';

export const statusLabel = (status: boolean): string =>
  status ? '啟用' : '已停權';

export const statusBadgeClass = (status: boolean): string =>
  status
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';

export const verifiedLabel = (
  emailVerifiedAt: string | null | undefined,
): string => (emailVerifiedAt ? '已驗證' : '未驗證');
