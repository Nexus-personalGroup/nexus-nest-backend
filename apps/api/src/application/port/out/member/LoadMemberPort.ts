import { Member } from '@app/domain/model/Member';

export const LOAD_MEMBER_PORT = 'LOAD_MEMBER_PORT';

export interface MemberRecordDto {
  id: string;
  email: string;
  member: string;
  roleId: string;
  roleName: string;
  status: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface ListMembersParams {
  page: number;
  limit: number;
  name?: string;
  email?: string;
  /** 啟用狀態過濾；undefined 表示不過濾 */
  status?: boolean;
}

export interface ListMembersPage {
  data: MemberRecordDto[];
  total: number;
}

export interface LoadMemberPort {
  loadMemberByEmail(email: string): Promise<Member | null>;
  /** 顯示用（含 roleName，不含 password） */
  loadMemberById(id: string): Promise<MemberRecordDto | null>;
  /** 更新 domain 操作用（含 password hash） */
  loadMemberDomainById(id: string): Promise<Member | null>;
  listMembers(params: ListMembersParams): Promise<ListMembersPage>;
  existsByEmail(email: string, excludeId?: string): Promise<boolean>;
  /**
   * 回傳其中「存在且已啟用」的成員 ID 子集。
   *
   * 回傳子集而非布林：呼叫端多半需要知道**是哪幾個**不合格才能給出有用的錯誤，
   * 而且一次查完避免 N 次往返。
   */
  findActiveMemberIds(ids: string[]): Promise<string[]>;
}
