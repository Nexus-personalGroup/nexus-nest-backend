export const PASSWORD_RESET_TOKEN_PORT = 'PASSWORD_RESET_TOKEN_PORT';

export interface PasswordResetTokenPort {
  /**
   * 建立密碼重設 token
   * @param memberId - 使用者 ID
   * @param expiresInMinutes - token 有效期（分鐘）
   * @returns 產生的 token 字串
   */
  createToken(memberId: string, expiresInMinutes: number): Promise<string>;

  /**
   * 原子地驗證並標記 token 已使用：一次 UPDATE 同時檢查未過期、未使用，
   * 避免「驗證 → 重設 → 標記」三步之間的併發 race（同 token 重複使用）
   * @param token - token 字串
   * @returns memberId 若 claim 成功；null 表示 token 不存在 / 已用 / 已過期
   */
  claim(token: string): Promise<{ memberId: string } | null>;
}
