export interface DeleteMemberCommand {
  id: string;
  actorId: string;
}

export const DELETE_MEMBER_USE_CASE = 'DELETE_MEMBER_USE_CASE';

export interface DeleteMemberUseCase {
  execute(command: DeleteMemberCommand): Promise<void>;
}
