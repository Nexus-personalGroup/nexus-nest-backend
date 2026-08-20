export const UPDATE_MEMBER_PASSWORD_PORT = 'UPDATE_MEMBER_PASSWORD_PORT';

export interface UpdateMemberPasswordPort {
  /**
   * 更新使用者密碼（已雜湊）並更新最後密碼更換時間
   * @param memberId - 使用者 ID
   * @param passwordHash - 已雜湊的新密碼
   */
  updatePassword(memberId: string, passwordHash: string): Promise<void>;
}
