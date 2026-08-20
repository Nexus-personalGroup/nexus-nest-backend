export interface CreateMemberCommand {
  email: string;
  member: string;
  password: string;
  roleId: string;
  status?: boolean;
}

export interface CreateMemberResult {
  id: string;
}

export const CREATE_MEMBER_USE_CASE = 'CREATE_MEMBER_USE_CASE';

export interface CreateMemberUseCase {
  execute(command: CreateMemberCommand): Promise<CreateMemberResult>;
}
