import { Module } from '@nestjs/common';
import { PingController } from '../../adapter/in/web/front/ping/PingController';
import { PingFacade } from '../../application/facade/front/PingFacade';
import { PING_USE_CASE } from '../../application/port/in/front/ping/PingUseCase';
import { PingService } from '../../application/service/front/ping/PingService';

/** 前台模組骨架示範。新前台模組請以 gen:module --front 產生後平鋪進 app.module */
@Module({
  controllers: [PingController],
  providers: [PingFacade, { provide: PING_USE_CASE, useClass: PingService }],
})
export class PingModule {}
