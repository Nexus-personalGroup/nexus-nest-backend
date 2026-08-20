import { Injectable } from '@nestjs/common';
import type {
  PingResult,
  PingUseCase,
} from '../../../port/in/front/ping/PingUseCase';

/**
 * 前台健康探測 Service（骨架示範）。
 * 實際前台功能請用 `pnpm --filter @app/api gen:module <name> --front` 產生。
 */
@Injectable()
export class PingService implements PingUseCase {
  execute(): PingResult {
    return { message: '前台 API 運作中' };
  }
}
