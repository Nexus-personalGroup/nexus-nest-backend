export interface MemberDetail {
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

export const GET_MEMBER_USE_CASE = 'GET_MEMBER_USE_CASE';

export interface GetMemberUseCase {
  execute(id: string): Promise<MemberDetail>;
}
