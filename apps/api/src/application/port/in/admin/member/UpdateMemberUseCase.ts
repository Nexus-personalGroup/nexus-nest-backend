export interface UpdateMemberCommand {
  id: string;
  /** 操作者 ID（當前登入者），用於自停檢查 */
  actorId: string;
  /** 以下欄位皆 optional：未提供表示不更動該欄位（PATCH 真 partial） */
  email?: string;
  member?: string;
  /** 提供時改密碼，空字串由 schema 轉成 undefined（不改） */
  password?: string;
  roleId?: string;
  status?: boolean;
}

export const UPDATE_MEMBER_USE_CASE = 'UPDATE_MEMBER_USE_CASE';

export interface UpdateMemberUseCase {
  execute(command: UpdateMemberCommand): Promise<void>;
}
