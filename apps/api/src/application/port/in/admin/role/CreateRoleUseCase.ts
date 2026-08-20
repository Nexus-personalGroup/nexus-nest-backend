export const CREATE_ROLE_USE_CASE = 'CREATE_ROLE_USE_CASE';

export interface CreateRoleCommand {
  name: string;
  permissionCodes: string[];
}

export interface CreateRoleResult {
  id: string;
}

export interface CreateRoleUseCase {
  execute(command: CreateRoleCommand): Promise<CreateRoleResult>;
}
