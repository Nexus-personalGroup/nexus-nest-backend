import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import {
  MetricsPort,
  WsEventOutcome,
} from '@app/application/port/out/MetricsPort';

/** 指標名稱集中在此，供 provider 工廠與測試共用 */
export const METRIC_NAMES = {
  MESSAGES: 'chat_messages_total',
  WRITE_SECONDS: 'chat_message_write_seconds',
  RATE_LIMITED: 'chat_rate_limited_total',
  WS_EVENTS: 'chat_ws_events_total',
  CONNECTIONS: 'chat_ws_connections',
} as const;

@Injectable()
export class PrometheusMetricsAdapter implements MetricsPort {
  constructor(
    @InjectMetric(METRIC_NAMES.MESSAGES)
    private readonly messages: Counter<string>,
    @InjectMetric(METRIC_NAMES.WRITE_SECONDS)
    private readonly writeSeconds: Histogram<string>,
    @InjectMetric(METRIC_NAMES.RATE_LIMITED)
    private readonly rateLimited: Counter<string>,
    @InjectMetric(METRIC_NAMES.WS_EVENTS)
    private readonly wsEvents: Counter<string>,
    @InjectMetric(METRIC_NAMES.CONNECTIONS)
    private readonly connections: Gauge<string>,
  ) {}

  incrementMessages(): void {
    this.messages.inc();
  }

  observeMessageWriteSeconds(seconds: number): void {
    this.writeSeconds.observe(seconds);
  }

  incrementRateLimited(): void {
    this.rateLimited.inc();
  }

  incrementWsEvent(event: string, outcome: WsEventOutcome): void {
    // 標籤只有事件名與結果：兩者都是封閉集合，基數可控
    this.wsEvents.inc({ event, outcome });
  }

  setConnections(count: number): void {
    this.connections.set(count);
  }
}
