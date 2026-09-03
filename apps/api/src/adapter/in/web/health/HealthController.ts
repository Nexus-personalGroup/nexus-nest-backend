import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { DbHealthIndicator } from './indicators/DbHealthIndicator';
import { RedisHealthIndicator } from './indicators/RedisHealthIndicator';
import { Public } from '../decorator/public.decorator';
import { InfraEndpoint } from '../decorator/infra-endpoint.decorator';

@Controller('health')
@SkipThrottle()
@Public()
// 探針是給機器用的：IP 黑白名單開啟時仍須可達，否則容器 healthcheck 與
// k8s liveness probe 會被自己的存取控制擋掉（前者整組起不來、後者無限重啟）
@InfraEndpoint()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DbHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * Liveness 探針：僅確認行程存活，永遠輕量回 200，不查任何外部依賴。
   * 供 k8s livenessProbe / 負載平衡器存活檢查使用。
   */
  @Get()
  liveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness 探針：確認是否可服務流量，檢查 DB 與 Redis 連線。
   * 任一依賴 down 時 terminus 回傳 503，供 readinessProbe 暫停導流。
   */
  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
