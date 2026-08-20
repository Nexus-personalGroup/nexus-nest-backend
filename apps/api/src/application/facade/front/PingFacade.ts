import { Inject, Injectable } from '@nestjs/common';
import { PING_USE_CASE } from '../../port/in/front/ping/PingUseCase';
import type {
  PingResult,
  PingUseCase,
} from '../../port/in/front/ping/PingUseCase';

/** 前台 Facade（骨架示範）：聚合前台 use case，供 controller 呼叫 */
@Injectable()
export class PingFacade {
  constructor(
    @Inject(PING_USE_CASE) private readonly pingUseCase: PingUseCase,
  ) {}

  ping(): PingResult {
    return this.pingUseCase.execute();
  }
}
