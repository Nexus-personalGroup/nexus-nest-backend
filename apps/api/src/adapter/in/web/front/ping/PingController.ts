import { Controller, Get } from '@nestjs/common';
import { PingFacade } from '@app/application/facade/front/PingFacade';
import type { PingResult } from '@app/application/port/in/front/ping/PingUseCase';
import { Public } from '../../decorator/public.decorator';

/**
 * 前台骨架示範 Controller：公開端點 GET /api/front/ping。
 *
 * 前後台以 in 側分層（controller / facade / service / port-in / module），
 * out 側（persistence / port-out）與 domain 共用、不分前後台。
 * 實際前台模組請用 `gen:module <name> --front` 產生後刪除本示範。
 */
@Controller('front/ping')
export class PingController {
  constructor(private readonly pingFacade: PingFacade) {}

  @Public()
  @Get()
  ping(): PingResult {
    return this.pingFacade.ping();
  }
}
