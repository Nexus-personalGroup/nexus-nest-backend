import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '@app/infrastructure/redis/redis.service';

/**
 * Redis 健康探測：透過 RedisService.ping() 主動發 PING，與 DB 的 SELECT 1 對稱。
 *
 * readiness 將 Redis 視為硬性依賴而非僅警示：token 黑名單採 fail-closed
 * （Redis 不可用時拋 503），Redis 斷線等同無法服務已驗證流量，故回 down
 * 讓負載平衡器停止導流。
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 探測 Redis 是否真正回應
   * @param key - 健康檢查結果中的鍵名
   * @returns up（PING 收到 PONG）或 down（無回應或連線中斷）
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const alive = await this.redis.ping();
    return alive ? indicator.up() : indicator.down({ message: 'Redis 未回應' });
  }
}
