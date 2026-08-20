import { Member } from '@app/domain/model/Member';

export const SAVE_MEMBER_PORT = 'SAVE_MEMBER_PORT';

export interface SaveMemberPort {
  /** 新建 member（Member factory 已產生 ID）。Email 重複時拋 EmailAlreadyExistsException */
  createMember(member: Member): Promise<void>;

  /** 更新既有 member（不含密碼）。找不到對應 ID 時拋 P2025 等 Prisma 例外 */
  updateMember(member: Member): Promise<void>;

  /**
   * 在同一 transaction 中更新 profile 和密碼，避免部分更新的不一致狀態
   * @param member - 更新後的 Member 實體
   * @param passwordHash - 已雜湊的新密碼
   */
  saveMemberWithPassword(member: Member, passwordHash: string): Promise<void>;

  deleteMember(id: string): Promise<void>;

  /** 更新最後登入時間（fire-and-forget） */
  updateLastLoginAt(id: string): Promise<void>;

  /** token 版本 +1：refresh 重用偵測時撤銷該使用者所有既有 token */
  incrementTokenVersion(id: string): Promise<void>;
}
