/**
 * 敏感鍵名的比對片段——採**子字串**比對，不是精確清單。
 *
 * 敏感欄位的變形是開放集合（`newPassword`、`oldPassword`、`confirmPassword`、
 * `user_password`、`passwordConfirmation`…），維護精確清單註定會漏：本專案就漏過
 * `newPassword`，讓 reset-password 的新密碼以明文寫進 `system_logs`。
 *
 * 代價是偶爾誤遮（例如 `passwordPolicy` 這種純設定欄位）。在 log 場景這是正確的
 * 取捨——少遮一次是憑證外洩，多遮一次只是少一條除錯資訊。
 */
const SENSITIVE_KEY_PATTERNS = [
  'password', // password / newPassword / oldPassword / passwordHash / user_password
  'token', // token / accessToken / refreshToken / access_token
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'bearer',
  'credential',
];

/** 去掉底線與連字號再比對，讓 snake_case 與 camelCase 走同一條規則 */
const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[_-]/g, '');

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
};

/**
 * query string 中要遮蔽的參數名——這裡**維持精確比對**，與上方的子字串比對不同。
 *
 * 理由：query 參數多為搜尋條件，子字串比對會誤傷（`key` 會吃掉 `keyword`、
 * `name` 會吃掉任何 `*Name` 過濾條件），而 URL 本身不像 request body 會帶憑證，
 * 這裡的目標是 PII 而非機密，過度遮蔽只是讓 log 失去除錯價值。
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'email',
  'phone',
  'name',
  'token',
  'key',
]);

export const sanitize = (obj: unknown): string => {
  try {
    return JSON.stringify(obj, (key: string, value: unknown) => {
      if (typeof value === 'string' && value.startsWith('data:image')) {
        return '[BASE64_IMAGE_REMOVED]';
      }
      if (isSensitiveKey(key)) {
        return '[REDACTED]';
      }
      if (key === 'file' || key === 'files') {
        return '[FILE_DATA_REMOVED]';
      }
      return value;
    });
  } catch {
    return '[Unserializable data]';
  }
};

/**
 * 遮蔽 URL query string 中的 PII 欄位值（如 email、phone）。
 * 範例：`/members?email=user@example.com` → `/members?email=[REDACTED]`
 */
export const sanitizeUrl = (url: string): string => {
  try {
    const [path, query] = url.split('?');
    if (!query) return url;
    const sanitized = query
      .split('&')
      .map((part) => {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) return part;
        const key = part.slice(0, eqIdx);
        if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
          return `${key}=[REDACTED]`;
        }
        return part;
      })
      .join('&');
    return `${path}?${sanitized}`;
  } catch {
    return url;
  }
};
