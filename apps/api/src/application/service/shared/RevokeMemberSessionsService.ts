import { Inject, Injectable } from '@nestjs/common';
import {
  REVOKE_MEMBER_SESSIONS_USE_CASE,
  RevokeMemberSessionsUseCase,
} from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '@app/application/port/out/EventPublisherPort';
import { SERVER_EVENTS } from '@app/application/port/out/server-events';

export { REVOKE_MEMBER_SESSIONS_USE_CASE };

@Injectable()
export class RevokeMemberSessionsService implements RevokeMemberSessionsUseCase {
  constructor(
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  execute(memberId: string): Promise<void> {
    // **先送事件、再斷線**，順序不可顛倒——斷線後就沒有管道可以說明原因了。
    // 沒有這個事件，Socket.IO 的客戶端會自動重連並在 handshake 被拒，
    // 進入無盡的重連迴圈，而使用者看到的是「一直在連線中」
    this.eventPublisher.publishToMember(
      memberId,
      SERVER_EVENTS.SESSION_REVOKED,
      { reason: 'ACCOUNT_DISABLED', revokedAt: new Date() },
    );

    // 兩者都是 adapter 感知的，因此跨實例生效
    this.eventPublisher.disconnectMember(memberId);
    return Promise.resolve();
  }
}
