import { Injectable } from '@nestjs/common';
import {
  MetricsPort,
  WsEventOutcome,
} from '@app/application/port/out/MetricsPort';

/**
 * 指標關閉時的實作。
 *
 * 讓業務程式碼不需要判斷開關——「要不要記」是接線層的決定，
 * 不該散落在每個呼叫點成為一堆 if。
 */
@Injectable()
export class NoopMetricsAdapter implements MetricsPort {
  // 參數刻意保留名稱以對齊 port 的簽章；用不到但不能省略，
  // 因此以 void 明示「知道它存在、就是不做事」，而非讓 lint 規則被放寬
  incrementMessages(): void {}

  observeMessageWriteSeconds(seconds: number): void {
    void seconds;
  }

  incrementRateLimited(): void {}

  incrementWsEvent(event: string, outcome: WsEventOutcome): void {
    void event;
    void outcome;
  }

  setConnections(count: number): void {
    void count;
  }
}
