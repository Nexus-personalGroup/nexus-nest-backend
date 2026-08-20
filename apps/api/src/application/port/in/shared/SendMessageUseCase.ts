import type { ChatMessage } from '@app/application/port/out/chat-message/ChatMessageRepositoryPort';

export const SEND_MESSAGE_USE_CASE = 'SEND_MESSAGE_USE_CASE';

export interface SendMessageCommand {
  roomId: string;
  /** 發送者；由連線的 MemberContext 帶入，不接受客戶端指定 */
  senderId: string;
  content: string;
  /** 客戶端在首次送出前產生，重試時沿用同一個值 */
  clientMessageId: string;
}

export interface SendMessageUseCase {
  execute(command: SendMessageCommand): Promise<ChatMessage>;
}
