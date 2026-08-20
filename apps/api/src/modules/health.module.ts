import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '../adapter/in/web/health/HealthController';
import { DbHealthIndicator } from '../adapter/in/web/health/indicators/DbHealthIndicator';
import { RedisHealthIndicator } from '../adapter/in/web/health/indicators/RedisHealthIndicator';

/**
 * 健康檢查模組：liveness / readiness 探針。
 * PrismaService、RedisService 由各自的 @Global() 模組提供，無需在此 import。
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DbHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
