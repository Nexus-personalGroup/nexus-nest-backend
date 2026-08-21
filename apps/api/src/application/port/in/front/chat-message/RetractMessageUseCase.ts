export const RETRACT_MESSAGE_USE_CASE = 'RETRACT_MESSAGE_USE_CASE';

export interface RetractMessageCommand {
  roomId: string;
  messageId: string;
  /** 呼叫者；只有發送者本人可以撤回自己的訊息 */
  memberId: string;
}

export interface RetractMessageUseCase {
  execute(command: RetractMessageCommand): Promise<void>;
}
