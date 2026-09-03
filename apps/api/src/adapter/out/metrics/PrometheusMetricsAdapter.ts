import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import {
  DashboardQuery,
  MetricsPort,
  SecurityGuard,
  WsEventOutcome,
} from '@app/application/port/out/MetricsPort';

/** 指標名稱集中在此，供 provider 工廠與測試共用 */
export const METRIC_NAMES = {
  MESSAGES: 'chat_messages_total',
  WRITE_SECONDS: 'chat_message_write_seconds',
  RATE_LIMITED: 'chat_rate_limited_total',
  WS_EVENTS: 'chat_ws_events_total',
  CONNECTIONS: 'chat_ws_connections',
  SECURITY_DEGRADED: 'security_guard_degraded_total',
  HEARTBEAT_SECONDS: 'chat_ws_heartbeat_seconds',
  HEARTBEAT_SKIPPED: 'chat_ws_heartbeat_skipped_total',
  DASHBOARD_QUERY_SECONDS: 'dashboard_query_seconds',
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
    @InjectMetric(METRIC_NAMES.SECURITY_DEGRADED)
    private readonly securityDegraded: Counter<string>,
    @InjectMetric(METRIC_NAMES.HEARTBEAT_SECONDS)
    private readonly heartbeatSeconds: Histogram<string>,
    @InjectMetric(METRIC_NAMES.HEARTBEAT_SKIPPED)
    private readonly heartbeatSkipped: Counter<string>,
    @InjectMetric(METRIC_NAMES.DASHBOARD_QUERY_SECONDS)
    private readonly dashboardQuerySeconds: Histogram<string>,
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

  incrementSecurityDegraded(guard: SecurityGuard): void {
    // 標籤是封閉集合（account-lock / ip-block），基數可控
    this.securityDegraded.inc({ guard });
  }

  observeHeartbeatSeconds(seconds: number): void {
    this.heartbeatSeconds.observe(seconds);
  }

  incrementHeartbeatSkipped(): void {
    this.heartbeatSkipped.inc();
  }

  observeDashboardQuerySeconds(query: DashboardQuery, seconds: number): void {
    // 標籤只有查詢名：五個值的封閉集合，基數可控
    this.dashboardQuerySeconds.observe({ query }, seconds);
  }
}
