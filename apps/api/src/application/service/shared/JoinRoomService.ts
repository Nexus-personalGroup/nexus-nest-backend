import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  JOIN_ROOM_USE_CASE,
  JoinRoomUseCase,
} from '@app/application/port/in/shared/JoinRoomUseCase';
import {
  ENSURE_ROOM_MEMBERSHIP_USE_CASE,
  EnsureRoomMembershipUseCase,
} from '@app/application/port/in/shared/EnsureRoomMembershipUseCase';
import {
  CHAT_AUDIT_PORT,
  ChatAuditPort,
} from '@app/application/port/out/ChatAuditPort';

export { JOIN_ROOM_USE_CASE };

@Injectable()
export class JoinRoomService implements JoinRoomUseCase {
  private readonly logger = new Logger(JoinRoomService.name);

  constructor(
    @Inject(ENSURE_ROOM_MEMBERSHIP_USE_CASE)
    private readonly ensureRoomMembership: EnsureRoomMembershipUseCase,
    @Inject(CHAT_AUDIT_PORT)
    private readonly audit: ChatAuditPort,
  ) {}

  async execute(memberId: string, roomId: string): Promise<void> {
    // 先取得許可：沒有資格的人不該在稽核裡留下「加入了」的紀錄
    await this.ensureRoomMembership.execute(memberId, roomId);

    // best-effort——稽核失敗不該讓人加不進房間
    await this.audit
      .record({ memberId, action: 'ROOM_JOINED', roomId })
      .catch((error: unknown) => this.logger.error('稽核寫入失敗', error));
  }
}
