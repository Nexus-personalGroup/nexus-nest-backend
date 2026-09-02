import { Module } from '@nestjs/common';
import { REVOKE_MEMBER_SESSIONS_USE_CASE } from '@app/application/port/in/shared/RevokeMemberSessionsUseCase';
import { RevokeMemberSessionsService } from '@app/application/service/shared/RevokeMemberSessionsService';
import { EventPublisherModule } from './event-publisher.module';

/**
 * 撤銷某個成員既有的即時連線（`REVOKE_MEMBER_SESSIONS_USE_CASE`）。
 *
 * 停權、強制登出這類動作都需要它——它們是**帳號管理**的功能，
 * 卻只能透過傳輸層達成（對個人房間廣播 `sessionRevoked` 再斷線）。
 * 獨立成一個模組，是為了讓 admin 側的帳號模組表達「我要撤銷連線」，
 * 而不是「我要整個 WebSocket 連線層」。
 *
 * 兩個停權入口（後台帳號與前台會員）拿到的必須是**同一份實作**，
 * 否則兩邊會各自漂移——這是它不能直接寫進各自模組的原因。
 *
 * 相依只有 `EventPublisherModule`：本 use case 除了送事件與斷線之外什麼都不碰。
 */
@Module({
  imports: [EventPublisherModule],
  providers: [
    {
      provide: REVOKE_MEMBER_SESSIONS_USE_CASE,
      useClass: RevokeMemberSessionsService,
    },
  ],
  exports: [REVOKE_MEMBER_SESSIONS_USE_CASE],
})
export class SessionRevocationModule {}
