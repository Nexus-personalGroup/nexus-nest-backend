export const DELETE_ATTACHMENT_USE_CASE = 'DELETE_ATTACHMENT_USE_CASE';

/** 執行刪除的使用者，用於擁有者檢查 */
export interface DeleteAttachmentActor {
  memberId: string;
  roleCode: string;
}

export interface DeleteAttachmentUseCase {
  execute(id: string, actor: DeleteAttachmentActor): Promise<void>;
}
