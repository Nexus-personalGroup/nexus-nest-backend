export const REMOVE_MESSAGE_USE_CASE = 'REMOVE_MESSAGE_USE_CASE';
export const RESTORE_MESSAGE_USE_CASE = 'RESTORE_MESSAGE_USE_CASE';

export interface ModerateMessageCommand {
  messageId: string;
  /** 執行動作的管理員；由 MemberContext 帶入，不接受客戶端指定 */
  moderatorId: string;
}

export interface RemoveMessageUseCase {
  execute(command: ModerateMessageCommand): Promise<void>;
}

export interface RestoreMessageUseCase {
  execute(command: ModerateMessageCommand): Promise<void>;
}
