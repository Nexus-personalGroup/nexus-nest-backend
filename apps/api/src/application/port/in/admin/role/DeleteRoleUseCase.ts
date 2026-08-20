export const DELETE_ROLE_USE_CASE = 'DELETE_ROLE_USE_CASE';

export interface DeleteRoleUseCase {
  execute(id: string): Promise<void>;
}
